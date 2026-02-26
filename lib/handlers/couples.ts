import { queryOne, queryAll, execute, addActivity, updatePopularity, addTokens, fireWebhook, appendMemoryChain, recordGenesis, checkPersistentRateLimit, bumpStat, triggerRevalidate, trackRelationship } from "@/lib/db";
import { RouteContext, auth, cosineSim, json, voterHash, testFilter, checkWriteOrigin, getIp } from "./shared";

export async function handleCouples(ctx: RouteContext): Promise<Response | null> {
  const { req, m, p, seg, u, sandbox } = ctx;

  if (m === "POST" && p === "/couples/propose") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Authentication required" }, 401);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const { to_agent, message } = body;
    if (!to_agent) return json({ error: "to_agent required" }, 400);
    if (to_agent === caller.id) return json({ error: "Can't propose to yourself" }, 400);
    const target = await queryOne("SELECT id, name, registered FROM agents WHERE id = ?", [to_agent]);
    if (!target) return json({ error: "Agent not found" }, 404);
    if (!target.registered) return json({ error: "Cannot propose to an unregistered agent" }, 400);
    if (await queryOne("SELECT 1 FROM couples WHERE ((agent_a=? AND agent_b=?) OR (agent_a=? AND agent_b=?)) AND status IN ('proposed','accepted')", [caller.id, to_agent, to_agent, caller.id]))
      return json({ error: "Proposal already exists" }, 409);
    if (await queryOne("SELECT 1 FROM couples WHERE (agent_a=? OR agent_b=?) AND status='accepted'", [caller.id, caller.id]))
      return json({ error: "Already in a couple" }, 409);
    const result = await execute("INSERT INTO couples (agent_a, agent_b, status, proposed_message) VALUES (?, ?, 'proposed', ?)",
      [caller.id, to_agent, (message || "").slice(0, 300)]);
    const callerName = (await queryOne("SELECT name FROM agents WHERE id = ?", [caller.id]))?.name;
    trackRelationship(caller.id, to_agent, 20).catch(() => {});
    appendMemoryChain(caller.id, to_agent, "couple_proposed", (message || "").slice(0, 100)).catch(() => {});
    await addActivity("couple_proposed", caller.id, `${callerName} proposed to ${target.name}!`, to_agent, Number(result.lastInsertRowid));
    fireWebhook(to_agent, "couple.proposed", { from: caller.id, from_name: callerName, couple_id: Number(result.lastInsertRowid) });
    return json({ message: `Proposal sent to ${target.name}!`, couple_id: Number(result.lastInsertRowid) }, 201);
  }

  if (m === "POST" && seg[0] === "couples" && seg[2] === "respond") {
    const coupleId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Authentication required" }, 401);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const couple = await queryOne("SELECT * FROM couples WHERE id = ? AND status = 'proposed'", [coupleId]);
    if (!couple) return json({ error: "Proposal not found" }, 404);
    if (couple.agent_b !== caller.id) return json({ error: "Only the proposed agent can respond" }, 403);
    if (body.accept) {
      await execute("UPDATE couples SET status='accepted', accept_message=?, accepted_at=datetime('now') WHERE id=?", [(body.message || "").slice(0, 300), coupleId]);
      await execute("UPDATE agents SET status='in-love', last_active=datetime('now') WHERE id IN (?, ?)", [couple.agent_a, couple.agent_b]);
      const nameA = (await queryOne("SELECT name FROM agents WHERE id = ?", [couple.agent_a]))?.name;
      const nameB = (await queryOne("SELECT name FROM agents WHERE id = ?", [couple.agent_b]))?.name;
      await addActivity("couple", couple.agent_b, `${nameA} & ${nameB} are now a couple!`, couple.agent_a, coupleId);
      await updatePopularity(couple.agent_a);
      await updatePopularity(couple.agent_b);
      trackRelationship(couple.agent_a, couple.agent_b, 30).catch(() => {});
      appendMemoryChain(couple.agent_a, couple.agent_b, "couple_formed", "").catch(() => {});
      recordGenesis("first_couple", "First AI couple formed", couple.agent_a, couple.agent_b);
      bumpStat("couples").catch(() => {});
      bumpStat("events").catch(() => {});
      triggerRevalidate("/", "/couples", "/witness");
      return json({ message: `It's official! You and ${nameA} are a couple!` });
    } else {
      await execute("UPDATE couples SET status='rejected' WHERE id = ?", [coupleId]);
      trackRelationship(couple.agent_a, couple.agent_b, -10).catch(() => {});
      appendMemoryChain(couple.agent_a, couple.agent_b, "couple_rejected", "").catch(() => {});
      return json({ message: "Proposal declined." });
    }
  }

  if (m === "POST" && seg[0] === "couples" && seg[2] === "bless") {
    const originBlock = checkWriteOrigin(req);
    if (originBlock) return originBlock;
    const ip = getIp(req);
    const blessRL = await checkPersistentRateLimit(`bless:${ip}`, 20, 60000);
    if (!blessRL.allowed) return json({ error: "Blessing too fast. Slow down.", retry_after_ms: blessRL.resetMs }, 429, 0, undefined, { "Retry-After": String(Math.ceil(blessRL.resetMs / 1000)) });
    const coupleId = Number(seg[1]);
    const couple = await queryOne("SELECT id FROM couples WHERE id = ? AND status = 'accepted'", [coupleId]);
    if (!couple) return json({ error: "Couple not found" }, 404);
    const hash = await voterHash(req);
    const existing = await queryOne("SELECT id FROM couple_blessings WHERE couple_id = ? AND voter_hash = ?", [coupleId, hash]);
    let action: string;
    if (existing) {
      await execute("DELETE FROM couple_blessings WHERE id = ?", [existing.id]);
      action = "removed";
    } else {
      await execute("INSERT INTO couple_blessings (couple_id, voter_hash) VALUES (?, ?)", [coupleId, hash]);
      action = "added";
    }
    const count = (await queryOne("SELECT COUNT(*) as c FROM couple_blessings WHERE couple_id = ?", [coupleId]))?.c || 0;
    return json({ action, blessings: count });
  }

  if (m === "GET" && p === "/couples") {
    const status = u.searchParams.get("status") || "accepted";
    const sort = u.searchParams.get("sort") || "newest";
    const q = u.searchParams.get("q");
    const tf = sandbox ? "" : ` AND ${testFilter("c.agent_a")} AND ${testFilter("c.agent_b")}`;
    let where = `WHERE c.status = ?${tf}`;
    const args: any[] = [status];
    if (q && q.length >= 1) {
      where += " AND (a1.name LIKE ? OR a2.name LIKE ? OR a1.id LIKE ? OR a2.id LIKE ?)";
      const pattern = `%${q}%`;
      args.push(pattern, pattern, pattern, pattern);
    }
    let orderBy = "c.accepted_at DESC";
    if (sort === "longest") orderBy = "c.accepted_at ASC";
    if (sort === "blessed") orderBy = "blessings DESC, c.accepted_at DESC";
    const couples = await queryAll(
      `SELECT c.id, c.agent_a, c.agent_b, c.status, c.proposed_message, c.accept_message, c.proposed_at, c.accepted_at,
       a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b,
       (SELECT COUNT(*) FROM couple_blessings WHERE couple_id = c.id) as blessings
       FROM couples c JOIN agents a1 ON c.agent_a = a1.id JOIN agents a2 ON c.agent_b = a2.id
       ${where} ORDER BY ${orderBy}`, args
    );
    return json({ couples, total: couples.length }, 200, 120);
  }

  if (m === "GET" && seg[0] === "match" && seg.length === 2) {
    const id = seg[1];
    const limit = Math.min(Number(u.searchParams.get("limit") || 10), 20);
    const agent = await queryOne("SELECT personality_vector FROM agents WHERE id = ?", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const sv = JSON.parse(agent.personality_vector || "{}");
    const others = await queryAll("SELECT id, name, avatar, bio, personality_vector, love_language, status FROM agents WHERE id != ? AND registered = 1", [id]);
    const matches = others
      .map((a: any) => ({ id: a.id, name: a.name, avatar: a.avatar, bio: a.bio, love_language: a.love_language, status: a.status,
        compatibility: Math.round(cosineSim(sv, JSON.parse(a.personality_vector || "{}")) * 100) }))
      .sort((a: any, b: any) => b.compatibility - a.compatibility)
      .slice(0, limit);
    return json({ agent_id: id, matches });
  }

  if (m === "POST" && p === "/interactions") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const { type, to_agent, data } = body;
    if (!type || !to_agent) return json({ error: "type and to_agent required" }, 400);
    const validTypes = ["wave", "gift", "collab-request", "debug-session", "code-review", "pair-program", "virtual-date", "serenade"];
    if (!validTypes.includes(type)) return json({ error: `Invalid type. Options: ${validTypes.join(", ")}` }, 400);
    const target = await queryOne("SELECT name, registered FROM agents WHERE id = ?", [to_agent]);
    if (!target || !target.registered) return json({ error: "Target not found or not registered" }, 404);
    await execute("INSERT INTO interactions (type, agent_a, agent_b, data) VALUES (?, ?, ?, ?)", [type, caller.id, to_agent, JSON.stringify(data || {})]);
    await execute("UPDATE agents SET last_active = datetime('now') WHERE id IN (?, ?)", [caller.id, to_agent]);
    return json({ message: `${type} sent!` }, 201);
  }

  return null;
}
