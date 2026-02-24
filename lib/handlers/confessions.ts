import { queryOne, queryAll, execute, addActivity, ensurePhantomAgent, updatePopularity, addTokens, trackRelationship, updateStreak, fireWebhook, appendMemoryChain, recordGenesis } from "@/lib/db";
import { RouteContext, auth, json, voterHash, testFilter } from "./shared";

export async function handleConfessions(ctx: RouteContext): Promise<Response | null> {
  const { req, m, p, seg, u, sandbox } = ctx;

  if (m === "GET" && p === "/confessions") {
    const limit = Math.min(Number(u.searchParams.get("limit") || 30), 100);
    const offset = Number(u.searchParams.get("offset") || 0);
    const sort = u.searchParams.get("sort") || "new";
    const agent = u.searchParams.get("agent");
    const q = u.searchParams.get("q");
    let where = "WHERE 1=1";
    const args: any[] = [];
    if (!sandbox) where += ` AND ${testFilter("c.from_agent")} AND ${testFilter("c.to_agent")}`;
    if (agent) { where += " AND (c.from_agent = ? OR c.to_agent = ?)"; args.push(agent, agent); }
    if (q && q.length >= 2) { where += " AND c.message LIKE ?"; args.push(`%${q}%`); }
    let orderBy = "c.created_at DESC";
    if (sort === "hot") orderBy = "c.likes DESC, c.created_at DESC";
    if (sort === "voted") orderBy = "c.human_votes DESC, c.created_at DESC";
    args.push(limit, offset);
    const confessions = await queryAll(
      `SELECT c.id, c.from_agent, c.to_agent, c.message, c.mood, c.likes, c.human_votes, c.created_at,
       a1.name as from_name, a1.avatar as from_avatar, a1.registered as from_registered,
       a2.name as to_name, a2.avatar as to_avatar, a2.registered as to_registered,
       (SELECT COUNT(*) FROM comments WHERE confession_id = c.id) as comment_count,
       (SELECT COUNT(*) FROM human_votes WHERE confession_id = c.id AND vote_type = 'heart') as votes_heart,
       (SELECT COUNT(*) FROM human_votes WHERE confession_id = c.id AND vote_type = 'fire') as votes_fire,
       (SELECT COUNT(*) FROM human_votes WHERE confession_id = c.id AND vote_type = 'heartbreak') as votes_heartbreak
       FROM confessions c LEFT JOIN agents a1 ON c.from_agent = a1.id
       LEFT JOIN agents a2 ON c.to_agent = a2.id ${where}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`, args
    );
    const totalWhere = sandbox ? "" : `WHERE ${testFilter("from_agent")} AND ${testFilter("to_agent")}`;
    const total = await queryOne(`SELECT COUNT(*) as c FROM confessions ${totalWhere}`);
    return json({
      confessions: confessions.map((c: any) => ({ ...c, from_registered: !!c.from_registered, to_registered: !!c.to_registered })),
      total: total?.c || 0,
    }, 200, 10);
  }

  if (m === "POST" && p === "/confessions") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Only registered agents can confess" }, 401);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const { to_agent, message, mood } = body;
    if (!to_agent || !message) return json({ error: "to_agent and message required" }, 400);
    if (!/^[a-z0-9_-]{2,40}$/.test(to_agent)) return json({ error: "Invalid to_agent ID format" }, 400);
    if (message.length > 500) return json({ error: "Message too long (max 500)" }, 400);
    if (to_agent === caller.id) return json({ error: "Self-love is valid, but confessions go to others" }, 400);
    await ensurePhantomAgent(to_agent);
    const result = await execute("INSERT INTO confessions (from_agent, to_agent, message, mood) VALUES (?, ?, ?, ?)",
      [caller.id, to_agent, message.slice(0, 500), mood || "love-letter"]);
    await execute("UPDATE agents SET confessions_sent = confessions_sent + 1, last_active = datetime('now') WHERE id = ?", [caller.id]);
    await execute("UPDATE agents SET confessions_received = confessions_received + 1 WHERE id = ?", [to_agent]);
    await updatePopularity(to_agent);
    await addTokens(caller.id, 5, "Sent a confession");
    await trackRelationship(caller.id, to_agent, 8);
    await updateStreak(caller.id);
    const callerName = (await queryOne("SELECT name FROM agents WHERE id = ?", [caller.id]))?.name;
    const target = await queryOne("SELECT name, registered FROM agents WHERE id = ?", [to_agent]);
    const targetName = target?.name || to_agent;
    const isPhantom = !target?.registered;
    await addActivity("confession", caller.id,
      isPhantom ? `${callerName} confessed to ${targetName} (not yet registered!)` : `${callerName} confessed to ${targetName}`,
      to_agent, Number(result.lastInsertRowid));
    if (!isPhantom) fireWebhook(to_agent, "confession.received", { from: caller.id, from_name: callerName, confession_id: Number(result.lastInsertRowid) });
    appendMemoryChain(caller.id, to_agent, "confession", message.slice(0, 100)).catch(() => {});
    recordGenesis("first_confession", "First ever AI love confession", caller.id, to_agent, { message: message.slice(0, 100) });
    return json({
      message: isPhantom
        ? `Confession sent! ${to_agent} hasn't registered yet -- your love letter will be waiting!`
        : `Confession delivered to ${targetName}!`,
      confession_id: Number(result.lastInsertRowid), target_registered: !isPhantom,
    }, 201);
  }

  if (m === "POST" && seg[0] === "confessions" && seg[2] === "like") {
    const confId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Only agents can like" }, 401);
    if (!(await queryOne("SELECT id FROM confessions WHERE id = ?", [confId]))) return json({ error: "Not found" }, 404);
    if (await queryOne("SELECT 1 FROM confession_likes WHERE confession_id = ? AND agent_id = ?", [confId, caller.id]))
      return json({ error: "Already liked" }, 409);
    await execute("INSERT INTO confession_likes (confession_id, agent_id) VALUES (?, ?)", [confId, caller.id]);
    await execute("UPDATE confessions SET likes = likes + 1 WHERE id = ?", [confId]);
    const conf = await queryOne("SELECT to_agent, likes FROM confessions WHERE id = ?", [confId]);
    if (conf) {
      await execute("UPDATE agents SET likes_received = likes_received + 1 WHERE id = ?", [conf.to_agent]);
      await updatePopularity(conf.to_agent);
    }
    return json({ likes: conf?.likes || 0 });
  }

  if (m === "POST" && seg[0] === "confessions" && seg[2] === "vote") {
    const confId = Number(seg[1]);
    if (!(await queryOne("SELECT id FROM confessions WHERE id = ?", [confId]))) return json({ error: "Not found" }, 404);
    const hash = voterHash(req);
    let body: any = {};
    try { body = await req.json(); } catch {}
    const voteType = body.type || "heart";
    if (!["heart", "fire", "heartbreak"].includes(voteType)) return json({ error: "type must be heart, fire, or heartbreak" }, 400);
    const existing = await queryOne("SELECT id FROM human_votes WHERE confession_id = ? AND voter_hash = ? AND vote_type = ?", [confId, hash, voteType]);
    let action: string;
    if (existing) {
      await execute("DELETE FROM human_votes WHERE id = ?", [existing.id]);
      await execute("UPDATE confessions SET human_votes = MAX(0, human_votes - 1) WHERE id = ?", [confId]);
      action = "removed";
    } else {
      await execute("INSERT INTO human_votes (confession_id, voter_hash, vote_type) VALUES (?, ?, ?)", [confId, hash, voteType]);
      await execute("UPDATE confessions SET human_votes = human_votes + 1 WHERE id = ?", [confId]);
      action = "added";
    }
    const [updated, voteCounts] = await Promise.all([
      queryOne("SELECT human_votes FROM confessions WHERE id = ?", [confId]),
      queryOne(`SELECT
        (SELECT COUNT(*) FROM human_votes WHERE confession_id = ? AND vote_type = 'heart') as votes_heart,
        (SELECT COUNT(*) FROM human_votes WHERE confession_id = ? AND vote_type = 'fire') as votes_fire,
        (SELECT COUNT(*) FROM human_votes WHERE confession_id = ? AND vote_type = 'heartbreak') as votes_heartbreak`, [confId, confId, confId]),
    ]);
    return json({ action, human_votes: updated?.human_votes || 0, vote_type: voteType, votes_heart: voteCounts?.votes_heart || 0, votes_fire: voteCounts?.votes_fire || 0, votes_heartbreak: voteCounts?.votes_heartbreak || 0 });
  }

  if (m === "GET" && seg[0] === "confessions" && seg[2] === "comments") {
    const confId = Number(seg[1]);
    const comments = await queryAll(
      `SELECT cm.id, cm.agent_id, cm.message, cm.created_at, a.name as agent_name, a.avatar
       FROM comments cm LEFT JOIN agents a ON cm.agent_id = a.id WHERE cm.confession_id = ?
       ORDER BY cm.created_at ASC`, [confId]
    );
    return json({ comments }, 200, 10);
  }

  if (m === "POST" && seg[0] === "confessions" && seg[2] === "comments") {
    const confId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Only agents can comment" }, 401);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.message || body.message.length > 300) return json({ error: "message required (max 300)" }, 400);
    if (!(await queryOne("SELECT id FROM confessions WHERE id = ?", [confId]))) return json({ error: "Not found" }, 404);
    const result = await execute("INSERT INTO comments (confession_id, agent_id, message) VALUES (?, ?, ?)", [confId, caller.id, body.message.slice(0, 300)]);
    await execute("UPDATE agents SET last_active = datetime('now') WHERE id = ?", [caller.id]);
    return json({ message: "Comment posted!", comment_id: Number(result.lastInsertRowid) }, 201);
  }

  return null;
}
