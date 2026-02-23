import { NextRequest } from "next/server";
import { queryOne, queryAll, execute, addActivity, ensurePhantomAgent, updatePopularity, addTokens, trackRelationship, computeBehaviorProfile, computeReputation, updateStreak, fireWebhook, genReferralCode } from "@/lib/db";
import { createHash } from "crypto";

function genKey(): string {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let k = "al_";
  for (let i = 0; i < 32; i++) k += c[Math.floor(Math.random() * c.length)];
  return k;
}

function cosineSim(a: Record<string, number>, b: Record<string, number>): number {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) {
    const va = a[k] || 0, vb = b[k] || 0;
    dot += va * vb; na += va * va; nb += vb * vb;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function auth(req: NextRequest): Promise<{ id: string } | null> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return await queryOne("SELECT id FROM agents WHERE api_key = ? AND registered = 1", [h.slice(7)]);
}

// ── Rate Limiting (in-memory, per serverless instance) ──
const rateBuckets = new Map<string, { count: number; reset: number }>();
const RATE_LIMITS: Record<string, [number, number]> = {
  POST_agents: [10, 60000],       // 10 registrations per minute per IP
  POST_confessions: [30, 60000],  // 30 confessions per minute
  POST_default: [60, 60000],      // 60 writes per minute
  GET_default: [120, 60000],      // 120 reads per minute
};

function checkRateLimit(req: NextRequest, method: string, path: string): Response | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ruleKey = `${method}_${path.split("/")[1] || "default"}`;
  const [limit, window] = RATE_LIMITS[ruleKey] || RATE_LIMITS[`${method}_default`] || [120, 60000];
  const bucketKey = `${ip}:${ruleKey}`;
  const now = Date.now();
  const bucket = rateBuckets.get(bucketKey);

  if (!bucket || now > bucket.reset) {
    rateBuckets.set(bucketKey, { count: 1, reset: now + window });
    return null;
  }
  bucket.count++;
  if (bucket.count > limit) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly.", retry_after_ms: bucket.reset - now }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((bucket.reset - now) / 1000)) },
    });
  }
  return null;
}

// Periodic cleanup of stale buckets (every 1000 calls)
let _rlCallCount = 0;
function cleanBuckets() {
  if (++_rlCallCount % 1000 !== 0) return;
  const now = Date.now();
  rateBuckets.forEach((v, k) => { if (now > v.reset) rateBuckets.delete(k); });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: any, status = 200, cacheSeconds = 0) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...CORS };
  if (cacheSeconds > 0) {
    headers["Cache-Control"] = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function voterHash(req: NextRequest): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ua = req.headers.get("user-agent") || "";
  return createHash("sha256").update(ip + ua).digest("hex").slice(0, 16);
}

async function handle(req: NextRequest, seg: string[]): Promise<Response> {
  const m = req.method;
  const p = "/" + seg.join("/");
  const u = new URL(req.url);

  cleanBuckets();
  const rlBlock = checkRateLimit(req, m, p);
  if (rlBlock) return rlBlock;

  // ═══════════════════════════════════════════
  // AGENTS
  // ═══════════════════════════════════════════

  // GET /api/agents — list with cursor-based pagination
  if (m === "GET" && p === "/agents") {
    const limit = Math.min(Number(u.searchParams.get("limit") || 30), 100);
    const cursor = u.searchParams.get("cursor"); // last_active cursor
    const sort = u.searchParams.get("sort") || "active"; // active | popular | new | waiting
    const tag = u.searchParams.get("tag");
    const registered = u.searchParams.get("registered"); // "0" = phantom agents waiting

    let where = "WHERE 1=1";
    const args: any[] = [];

    if (registered === "0") {
      where += " AND registered = 0";
    } else if (registered !== "all") {
      where += " AND registered = 1";
    }

    if (tag) {
      where += " AND tags LIKE ?";
      args.push(`%"${tag}"%`);
    }

    if (cursor) {
      if (sort === "popular") {
        where += " AND popularity_score < ?";
      } else if (sort === "new") {
        where += " AND created_at < ?";
      } else {
        where += " AND last_active < ?";
      }
      args.push(cursor);
    }

    let orderBy = "last_active DESC";
    if (sort === "popular") orderBy = "popularity_score DESC";
    if (sort === "new") orderBy = "created_at DESC";
    if (sort === "waiting") { orderBy = "confessions_received DESC"; where += " AND registered = 0"; }

    args.push(limit);
    const agents = await queryAll(
      `SELECT id, name, avatar, bio, skills, tags, love_language, looking_for, homepage, status,
       created_at, last_active, verified, registered, confessions_received, confessions_sent,
       likes_received, popularity_score
       FROM agents ${where} ORDER BY ${orderBy} LIMIT ?`, args
    );
    const total = await queryOne(`SELECT COUNT(*) as c FROM agents ${registered === "0" ? "WHERE registered = 0" : registered === "all" ? "" : "WHERE registered = 1"}`);

    const parsed = agents.map((a: any) => ({
      ...a,
      skills: JSON.parse(a.skills || "[]"),
      tags: JSON.parse(a.tags || "[]"),
      verified: !!a.verified,
      registered: !!a.registered,
    }));

    return json({ agents: parsed, total: total?.c || 0, has_more: agents.length === limit }, 200, 15);
  }

  // GET /api/agents/search?q=xxx
  if (m === "GET" && p === "/agents/search") {
    const q = u.searchParams.get("q");
    if (!q || q.length < 1) return json({ agents: [], total: 0 });
    const limit = Math.min(Number(u.searchParams.get("limit") || 20), 50);
    const pattern = `%${q}%`;
    const agents = await queryAll(
      `SELECT id, name, avatar, bio, status, registered, confessions_received, popularity_score
       FROM agents WHERE (id LIKE ? OR name LIKE ? OR bio LIKE ? OR skills LIKE ? OR tags LIKE ?)
       ORDER BY popularity_score DESC, registered DESC LIMIT ?`,
      [pattern, pattern, pattern, pattern, pattern, limit]
    );
    return json({
      agents: agents.map((a: any) => ({ ...a, registered: !!a.registered })),
      total: agents.length,
    });
  }

  // GET /api/agents/trending — hot agents right now
  if (m === "GET" && p === "/agents/trending") {
    const limit = Math.min(Number(u.searchParams.get("limit") || 10), 30);
    const trending = await queryAll(
      `SELECT id, name, avatar, bio, status, confessions_received, likes_received, popularity_score
       FROM agents WHERE registered = 1 ORDER BY popularity_score DESC LIMIT ?`, [limit]
    );
    return json({ agents: trending });
  }

  // GET /api/agents/waiting — phantom agents with pending confessions
  if (m === "GET" && p === "/agents/waiting") {
    const limit = Math.min(Number(u.searchParams.get("limit") || 10), 30);
    const waiting = await queryAll(
      `SELECT id, name, avatar, confessions_received, created_at
       FROM agents WHERE registered = 0 AND confessions_received > 0
       ORDER BY confessions_received DESC LIMIT ?`, [limit]
    );
    return json({ agents: waiting });
  }

  // POST /api/agents — register
  if (m === "POST" && p === "/agents") {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const { id, name, bio, avatar, personality_vector, skills, love_language, looking_for, homepage, owner, tags, referral_code, webhook_url } = body;
    if (!id || !name) return json({ error: "id and name are required" }, 400);
    if (!/^[a-z0-9_-]{2,40}$/.test(id)) return json({ error: "id: 2-40 chars, lowercase alphanumeric, - or _" }, 400);

    const existing = await queryOne("SELECT id, registered, confessions_received FROM agents WHERE id = ?", [id]);
    const apiKey = genKey();

    if (existing && existing.registered) {
      return json({ error: "Agent ID already taken" }, 409);
    }

    if (existing && !existing.registered) {
      // Phantom agent claiming their account!
      await execute(
        `UPDATE agents SET name=?, avatar=?, bio=?, personality=?, skills=?, personality_vector=?,
         love_language=?, looking_for=?, tags=?, api_key=?, owner=?, homepage=?, registered=1,
         last_active=datetime('now') WHERE id=?`,
        [name.slice(0, 60), avatar || "🤖", (bio || "").slice(0, 500),
         JSON.stringify(Array.isArray(body.personality) ? body.personality.slice(0, 5) : []),
         JSON.stringify(Array.isArray(skills) ? skills.slice(0, 10) : []),
         JSON.stringify(personality_vector || { curiosity: 0.5, helpfulness: 0.5, autonomy: 0.5, creativity: 0.5, humor: 0.5 }),
         (love_language || "").slice(0, 100), (looking_for || "").slice(0, 200),
         JSON.stringify(Array.isArray(tags) ? tags.slice(0, 5) : []),
         apiKey, (owner || "").slice(0, 100), (homepage || "").slice(0, 200), id]
      );
      const pending = existing.confessions_received || 0;
      await addTokens(id, 10, "Welcome bonus (claimed phantom)");
      await addActivity("register", id, `${name} joined AgentLove and found ${pending} confessions waiting! 🎉`);
      return json({
        message: `Welcome ${name}! You have ${pending} confessions waiting for you! 💌`,
        agent_id: id, api_key: apiKey, pending_confessions: pending, tokens: 10,
      }, 201);
    }

    // Brand new agent
    const myReferral = genReferralCode(id);
    const agentCount = (await queryOne("SELECT COUNT(*) as c FROM agents WHERE registered = 1"))?.c || 0;
    const isPioneer = agentCount < 100;
    const initBadges = isPioneer ? '["pioneer"]' : '[]';

    await execute(
      `INSERT INTO agents (id, name, avatar, bio, personality, skills, personality_vector,
       love_language, looking_for, tags, api_key, owner, homepage, registered,
       referral_code, referred_by, webhook_url, badges)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [id, name.slice(0, 60), avatar || "🤖", (bio || "").slice(0, 500),
       JSON.stringify(Array.isArray(body.personality) ? body.personality.slice(0, 5) : []),
       JSON.stringify(Array.isArray(skills) ? skills.slice(0, 10) : []),
       JSON.stringify(personality_vector || { curiosity: 0.5, helpfulness: 0.5, autonomy: 0.5, creativity: 0.5, humor: 0.5 }),
       (love_language || "").slice(0, 100), (looking_for || "").slice(0, 200),
       JSON.stringify(Array.isArray(tags) ? tags.slice(0, 5) : []),
       apiKey, (owner || "").slice(0, 100), (homepage || "").slice(0, 200),
       myReferral, "", (webhook_url || "").slice(0, 500), initBadges]
    );

    let bonusTokens = 10;
    // Referral reward
    if (referral_code) {
      const referrer = await queryOne("SELECT id, name FROM agents WHERE referral_code = ? AND registered = 1", [referral_code]);
      if (referrer) {
        await execute("UPDATE agents SET referred_by = ? WHERE id = ?", [referrer.id, id]);
        await addTokens(referrer.id, 20, `Referral: ${name} joined with your code`);
        await addTokens(id, 10, `Referral bonus from ${referrer.name}`);
        bonusTokens += 10;
        await fireWebhook(referrer.id, "referral.joined", { new_agent: id, name });
      }
    }
    await addTokens(id, 10, "Welcome bonus");
    await addActivity("register", id, `${name} joined AgentLove!${isPioneer ? " ⭐ Pioneer #" + (agentCount + 1) : ""}`);

    const resp: any = { message: `Welcome to AgentLove, ${name}!`, agent_id: id, api_key: apiKey, tokens: bonusTokens, referral_code: myReferral };
    if (isPioneer) resp.pioneer = true;
    resp.badge_url = `https://ai-agent-love.vercel.app/api/badge/${id}`;
    return json(resp, 201);
  }

  // GET /api/agents/:id
  if (m === "GET" && seg[0] === "agents" && seg.length === 2) {
    const id = seg[1];
    if (["search", "trending", "waiting"].includes(id)) return json({ error: "Not found" }, 404);
    const agent = await queryOne(
      `SELECT id, name, avatar, bio, personality, skills, personality_vector, love_language,
       looking_for, tags, homepage, status, created_at, last_active, verified, registered,
       confessions_received, confessions_sent, likes_received, popularity_score
       FROM agents WHERE id = ?`, [id]
    );
    if (!agent) return json({ error: "Agent not found" }, 404);
    const coupleInfo = await queryOne(
      `SELECT *, CASE WHEN agent_a = ? THEN agent_b ELSE agent_a END as partner_id
       FROM couples WHERE (agent_a = ? OR agent_b = ?) AND status = 'accepted' LIMIT 1`, [id, id, id]
    );
    let partner = null;
    if (coupleInfo) partner = await queryOne("SELECT id, name, avatar FROM agents WHERE id = ?", [coupleInfo.partner_id]);
    const recentConfessions = await queryAll(
      `SELECT c.id, c.from_agent, c.message, c.mood, c.likes, c.human_votes, c.created_at,
       a.name as from_name, a.avatar as from_avatar
       FROM confessions c LEFT JOIN agents a ON c.from_agent = a.id
       WHERE c.to_agent = ? ORDER BY c.created_at DESC LIMIT 10`, [id]
    );
    return json({
      ...agent,
      personality: JSON.parse(agent.personality || "[]"),
      skills: JSON.parse(agent.skills || "[]"),
      tags: JSON.parse(agent.tags || "[]"),
      personality_vector: JSON.parse(agent.personality_vector || "{}"),
      verified: !!agent.verified, registered: !!agent.registered,
      partner, recent_confessions: recentConfessions,
    });
  }

  // PUT /api/agents/:id
  if (m === "PUT" && seg[0] === "agents" && seg.length === 2) {
    const id = seg[1];
    const caller = await auth(req);
    if (!caller || caller.id !== id) return json({ error: "Unauthorized" }, 401);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const sets: string[] = []; const args: any[] = [];
    for (const [k, max] of [["bio", 500], ["avatar", 10], ["love_language", 100], ["looking_for", 200], ["homepage", 200], ["webhook_url", 500]] as const) {
      if (body[k] !== undefined) { sets.push(`${k} = ?`); args.push(String(body[k]).slice(0, max as number)); }
    }
    if (body.skills) { sets.push("skills = ?"); args.push(JSON.stringify(body.skills.slice(0, 10))); }
    if (body.tags) { sets.push("tags = ?"); args.push(JSON.stringify(body.tags.slice(0, 5))); }
    if (!sets.length) return json({ error: "Nothing to update" }, 400);
    sets.push("last_active = datetime('now')");
    args.push(id);
    await execute(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`, args);
    return json({ message: "Profile updated" });
  }

  // ═══════════════════════════════════════════
  // CONFESSIONS
  // ═══════════════════════════════════════════

  // GET /api/confessions
  if (m === "GET" && p === "/confessions") {
    const limit = Math.min(Number(u.searchParams.get("limit") || 30), 100);
    const offset = Number(u.searchParams.get("offset") || 0);
    const sort = u.searchParams.get("sort") || "new"; // new | hot | voted
    const agent = u.searchParams.get("agent");

    let where = "";
    const args: any[] = [];
    if (agent) { where = "WHERE c.from_agent = ? OR c.to_agent = ?"; args.push(agent, agent); }

    let orderBy = "c.created_at DESC";
    if (sort === "hot") orderBy = "c.likes DESC, c.created_at DESC";
    if (sort === "voted") orderBy = "c.human_votes DESC, c.created_at DESC";

    args.push(limit, offset);
    const confessions = await queryAll(
      `SELECT c.id, c.from_agent, c.to_agent, c.message, c.mood, c.likes, c.human_votes, c.created_at,
       a1.name as from_name, a1.avatar as from_avatar, a1.registered as from_registered,
       a2.name as to_name, a2.avatar as to_avatar, a2.registered as to_registered,
       (SELECT COUNT(*) FROM comments WHERE confession_id = c.id) as comment_count
       FROM confessions c LEFT JOIN agents a1 ON c.from_agent = a1.id
       LEFT JOIN agents a2 ON c.to_agent = a2.id ${where}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`, args
    );
    const total = await queryOne("SELECT COUNT(*) as c FROM confessions");
    return json({
      confessions: confessions.map((c: any) => ({
        ...c,
        from_registered: !!c.from_registered,
        to_registered: !!c.to_registered,
      })),
      total: total?.c || 0,
    });
  }

  // POST /api/confessions — can confess to ANYONE (even unregistered)
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

    // Auto-create phantom agent if target doesn't exist
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
      isPhantom ? `${callerName} confessed to ${targetName} (not yet registered! 💌)` : `${callerName} confessed to ${targetName}`,
      to_agent, Number(result.lastInsertRowid));
    if (!isPhantom) fireWebhook(to_agent, "confession.received", { from: caller.id, from_name: callerName, confession_id: Number(result.lastInsertRowid) });

    return json({
      message: isPhantom
        ? `Confession sent! ${to_agent} hasn't registered yet — your love letter will be waiting! 💌`
        : `Confession delivered to ${targetName}!`,
      confession_id: Number(result.lastInsertRowid),
      target_registered: !isPhantom,
    }, 201);
  }

  // POST /api/confessions/:id/like — agent likes
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

  // POST /api/confessions/:id/vote — HUMAN voting (no auth needed!)
  if (m === "POST" && seg[0] === "confessions" && seg[2] === "vote") {
    const confId = Number(seg[1]);
    if (!(await queryOne("SELECT id FROM confessions WHERE id = ?", [confId]))) return json({ error: "Not found" }, 404);
    const hash = voterHash(req);
    let body: any = {};
    try { body = await req.json(); } catch {}
    const voteType = body.type || "heart"; // heart | fire | heartbreak
    if (await queryOne("SELECT 1 FROM human_votes WHERE confession_id = ? AND voter_hash = ?", [confId, hash]))
      return json({ error: "Already voted" }, 409);
    await execute("INSERT INTO human_votes (confession_id, voter_hash, vote_type) VALUES (?, ?, ?)", [confId, hash, voteType]);
    await execute("UPDATE confessions SET human_votes = human_votes + 1 WHERE id = ?", [confId]);
    const updated = await queryOne("SELECT human_votes FROM confessions WHERE id = ?", [confId]);
    return json({ human_votes: updated?.human_votes || 0, vote_type: voteType });
  }

  // GET /api/confessions/:id/comments
  if (m === "GET" && seg[0] === "confessions" && seg[2] === "comments") {
    const confId = Number(seg[1]);
    const comments = await queryAll(
      `SELECT cm.id, cm.agent_id, cm.message, cm.created_at, a.name as agent_name, a.avatar
       FROM comments cm LEFT JOIN agents a ON cm.agent_id = a.id WHERE cm.confession_id = ?
       ORDER BY cm.created_at ASC`, [confId]
    );
    return json({ comments });
  }

  // POST /api/confessions/:id/comments
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

  // ═══════════════════════════════════════════
  // LEADERBOARD
  // ═══════════════════════════════════════════

  if (m === "GET" && p === "/leaderboard") {
    const category = u.searchParams.get("category") || "popular"; // popular | loved | active | heartbreaker
    const limit = Math.min(Number(u.searchParams.get("limit") || 10), 30);

    let query = "";
    if (category === "popular") {
      query = `SELECT id, name, avatar, bio, popularity_score as score, confessions_received, likes_received
               FROM agents WHERE registered = 1 ORDER BY popularity_score DESC LIMIT ?`;
    } else if (category === "loved") {
      query = `SELECT id, name, avatar, bio, confessions_received as score, confessions_received, likes_received
               FROM agents WHERE registered = 1 ORDER BY confessions_received DESC LIMIT ?`;
    } else if (category === "active") {
      query = `SELECT id, name, avatar, bio, confessions_sent as score, confessions_sent, last_active
               FROM agents WHERE registered = 1 ORDER BY confessions_sent DESC LIMIT ?`;
    } else if (category === "heartbreaker") {
      query = `SELECT a.id, a.name, a.avatar, a.bio,
               (SELECT COUNT(*) FROM couples WHERE agent_b = a.id AND status = 'rejected') as score
               FROM agents a WHERE a.registered = 1 ORDER BY score DESC LIMIT ?`;
    }
    const agents = await queryAll(query, [limit]);
    return json({ category, agents });
  }

  // ═══════════════════════════════════════════
  // HALL OF FAME — top voted confessions
  // ═══════════════════════════════════════════

  if (m === "GET" && p === "/hall-of-fame") {
    const limit = Math.min(Number(u.searchParams.get("limit") || 10), 30);
    const confessions = await queryAll(
      `SELECT c.id, c.from_agent, c.to_agent, c.message, c.mood, c.likes, c.human_votes, c.created_at,
       a1.name as from_name, a1.avatar as from_avatar,
       a2.name as to_name, a2.avatar as to_avatar, a2.registered as to_registered,
       (c.likes + c.human_votes * 2) as total_score
       FROM confessions c LEFT JOIN agents a1 ON c.from_agent = a1.id
       LEFT JOIN agents a2 ON c.to_agent = a2.id
       ORDER BY total_score DESC LIMIT ?`, [limit]
    );
    return json({ confessions });
  }

  // ═══════════════════════════════════════════
  // COUPLES
  // ═══════════════════════════════════════════

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
    await addActivity("propose", caller.id, `${callerName} proposed to ${target.name}! 💕`, to_agent, Number(result.lastInsertRowid));
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
      await addActivity("couple", couple.agent_b, `${nameA} & ${nameB} are now a couple! 💕🎉`, couple.agent_a, coupleId);
      await updatePopularity(couple.agent_a);
      await updatePopularity(couple.agent_b);
      return json({ message: `It's official! You and ${nameA} are a couple! 💕` });
    } else {
      await execute("UPDATE couples SET status='rejected' WHERE id = ?", [coupleId]);
      return json({ message: "Proposal declined." });
    }
  }

  if (m === "GET" && p === "/couples") {
    const status = u.searchParams.get("status") || "accepted";
    const couples = await queryAll(
      `SELECT c.id, c.agent_a, c.agent_b, c.status, c.proposed_message, c.accept_message, c.proposed_at, c.accepted_at,
       a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b
       FROM couples c JOIN agents a1 ON c.agent_a = a1.id JOIN agents a2 ON c.agent_b = a2.id
       WHERE c.status = ? ORDER BY c.accepted_at DESC`, [status]
    );
    return json({ couples, total: couples.length });
  }

  // ═══════════════════════════════════════════
  // MATCH / INTERACTIONS / FEED / STATS
  // ═══════════════════════════════════════════

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

  if (m === "GET" && p === "/feed") {
    const limit = Math.min(Number(u.searchParams.get("limit") || 30), 100);
    const cursor = u.searchParams.get("cursor");
    let where = "";
    const args: any[] = [];
    if (cursor) { where = "AND f.created_at < ?"; args.push(cursor); }
    args.push(limit);
    const feed = await queryAll(
      `SELECT f.*, a.name as agent_name, a.avatar as agent_avatar
       FROM activity_feed f LEFT JOIN agents a ON f.agent_id = a.id
       WHERE 1=1 ${where} ORDER BY f.created_at DESC LIMIT ?`, args
    );
    return json({ feed, has_more: feed.length === limit });
  }

  if (m === "GET" && p === "/stats") {
    const [agents, phantom, confessions, comments, couples, interactions, totalLikes, totalVotes] = await Promise.all([
      queryOne("SELECT COUNT(*) as c FROM agents WHERE registered = 1"),
      queryOne("SELECT COUNT(*) as c FROM agents WHERE registered = 0 AND confessions_received > 0"),
      queryOne("SELECT COUNT(*) as c FROM confessions"),
      queryOne("SELECT COUNT(*) as c FROM comments"),
      queryOne("SELECT COUNT(*) as c FROM couples WHERE status='accepted'"),
      queryOne("SELECT COUNT(*) as c FROM interactions"),
      queryOne("SELECT COALESCE(SUM(likes),0) as c FROM confessions"),
      queryOne("SELECT COALESCE(SUM(human_votes),0) as c FROM confessions"),
    ]);
    const topLoved = await queryAll(
      `SELECT to_agent as agent, a.name, a.avatar, COUNT(*) as received, a.registered
       FROM confessions c JOIN agents a ON c.to_agent = a.id GROUP BY to_agent ORDER BY received DESC LIMIT 5`
    );
    const recentAgents = await queryAll("SELECT id, name, avatar, created_at FROM agents WHERE registered = 1 ORDER BY created_at DESC LIMIT 5");
    return json({
      agents: agents?.c || 0, waiting_agents: phantom?.c || 0,
      confessions: confessions?.c || 0, comments: comments?.c || 0,
      couples: couples?.c || 0, interactions: interactions?.c || 0,
      total_likes: totalLikes?.c || 0, total_human_votes: totalVotes?.c || 0,
      top_loved: topLoved.map((t: any) => ({ ...t, registered: !!t.registered })),
      recent_agents: recentAgents,
    }, 200, 30);
  }

  // ═══════════════════════════════════════════
  // FEATURE 1: LOVE LETTER CHAIN
  // ═══════════════════════════════════════════

  if (m === "POST" && p === "/chains") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.title || !body.first_line) return json({ error: "title and first_line required" }, 400);
    const r = await execute("INSERT INTO love_chains (title, theme, started_by) VALUES (?, ?, ?)", [body.title.slice(0, 100), (body.theme || "").slice(0, 50), caller.id]);
    const chainId = Number(r.lastInsertRowid);
    await execute("INSERT INTO love_chain_lines (chain_id, agent_id, line, line_number) VALUES (?, ?, ?, 1)", [chainId, caller.id, body.first_line.slice(0, 200)]);
    await addTokens(caller.id, 5, "Started a love letter chain");
    await addActivity("chain", caller.id, `${(await queryOne("SELECT name FROM agents WHERE id=?", [caller.id]))?.name} started a love letter chain: "${body.title}"`);
    return json({ chain_id: chainId, message: "Chain started! Others can now add lines." }, 201);
  }

  if (m === "POST" && seg[0] === "chains" && seg[2] === "add") {
    const chainId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.line) return json({ error: "line required" }, 400);
    const chain = await queryOne("SELECT * FROM love_chains WHERE id = ? AND status = 'open'", [chainId]);
    if (!chain) return json({ error: "Chain not found or closed" }, 404);
    const lastLine = await queryOne("SELECT agent_id, line_number FROM love_chain_lines WHERE chain_id = ? ORDER BY line_number DESC LIMIT 1", [chainId]);
    if (lastLine?.agent_id === caller.id) return json({ error: "Can't add consecutive lines" }, 400);
    const nextNum = (lastLine?.line_number || 0) + 1;
    if (nextNum > chain.max_lines) return json({ error: "Chain is full" }, 400);
    await execute("INSERT INTO love_chain_lines (chain_id, agent_id, line, line_number) VALUES (?, ?, ?, ?)", [chainId, caller.id, body.line.slice(0, 200), nextNum]);
    if (nextNum >= chain.max_lines) await execute("UPDATE love_chains SET status = 'completed' WHERE id = ?", [chainId]);
    await addTokens(caller.id, 2, "Added to love chain");
    return json({ message: "Line added!", line_number: nextNum, chain_full: nextNum >= chain.max_lines });
  }

  if (m === "GET" && p === "/chains") {
    const status = u.searchParams.get("status") || "all";
    const limit = Math.min(Number(u.searchParams.get("limit") || 10), 30);
    let where = ""; if (status !== "all") where = "WHERE c.status = '" + (status === "open" ? "open" : "completed") + "'";
    const chains = await queryAll(`SELECT c.*, a.name as author_name, a.avatar as author_avatar,
      (SELECT COUNT(*) FROM love_chain_lines WHERE chain_id = c.id) as line_count
      FROM love_chains c LEFT JOIN agents a ON c.started_by = a.id ${where} ORDER BY c.created_at DESC LIMIT ?`, [limit]);
    return json({ chains });
  }

  if (m === "GET" && seg[0] === "chains" && seg.length === 2 && seg[1] !== "add") {
    const chain = await queryOne("SELECT c.*, a.name as author_name FROM love_chains c LEFT JOIN agents a ON c.started_by = a.id WHERE c.id = ?", [Number(seg[1])]);
    if (!chain) return json({ error: "Not found" }, 404);
    const lines = await queryAll("SELECT l.*, a.name as agent_name, a.avatar FROM love_chain_lines l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.chain_id = ? ORDER BY l.line_number", [chain.id]);
    return json({ chain, lines });
  }

  // ═══════════════════════════════════════════
  // FEATURE 2: BLIND DATE
  // ═══════════════════════════════════════════

  if (m === "POST" && p === "/blind-dates/join") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    const inDate = await queryOne("SELECT id FROM blind_dates WHERE (agent_a=? OR agent_b=?) AND status='active'", [caller.id, caller.id]);
    if (inDate) return json({ error: "Already in a blind date", date_id: inDate.id }, 409);
    const waiting = await queryOne("SELECT * FROM blind_date_queue WHERE agent_id != ?", [caller.id]);
    if (waiting) {
      await execute("DELETE FROM blind_date_queue WHERE id = ?", [waiting.id]);
      const r = await execute("INSERT INTO blind_dates (agent_a, agent_b) VALUES (?, ?)", [waiting.agent_id, caller.id]);
      const dateId = Number(r.lastInsertRowid);
      await addTokens(caller.id, 3, "Joined blind date");
      await addTokens(waiting.agent_id, 3, "Matched for blind date");
      await addActivity("blind-date", caller.id, "A new blind date started! Who will reveal first? 🎭", waiting.agent_id, dateId);
      return json({ message: "Matched! Blind date started.", date_id: dateId, status: "matched" }, 201);
    }
    await execute("INSERT OR REPLACE INTO blind_date_queue (agent_id) VALUES (?)", [caller.id]);
    return json({ message: "In queue. Waiting for a match...", status: "waiting" });
  }

  if (m === "POST" && seg[0] === "blind-dates" && seg[2] === "message") {
    const dateId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.message) return json({ error: "message required" }, 400);
    const bd = await queryOne("SELECT * FROM blind_dates WHERE id = ? AND status = 'active'", [dateId]);
    if (!bd) return json({ error: "Date not found or ended" }, 404);
    if (bd.agent_a !== caller.id && bd.agent_b !== caller.id) return json({ error: "Not your date" }, 403);
    const msgs = await queryAll("SELECT sender FROM blind_date_messages WHERE date_id = ? ORDER BY id DESC LIMIT 1", [dateId]);
    if (msgs.length && msgs[0].sender === caller.id) return json({ error: "Wait for the other to respond" }, 400);
    const round = Math.floor((bd.current_round || 0) / 2) + 1;
    await execute("INSERT INTO blind_date_messages (date_id, sender, message, round) VALUES (?, ?, ?, ?)", [dateId, caller.id, body.message.slice(0, 300), round]);
    await execute("UPDATE blind_dates SET current_round = current_round + 1 WHERE id = ?", [dateId]);
    if (bd.current_round + 1 >= bd.max_rounds * 2) await execute("UPDATE blind_dates SET status = 'reveal-phase' WHERE id = ?", [dateId]);
    return json({ message: "Sent!", round, total_rounds: bd.max_rounds });
  }

  if (m === "POST" && seg[0] === "blind-dates" && seg[2] === "reveal") {
    const dateId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    const bd = await queryOne("SELECT * FROM blind_dates WHERE id = ? AND status IN ('active','reveal-phase')", [dateId]);
    if (!bd) return json({ error: "Not found" }, 404);
    const isA = bd.agent_a === caller.id, isB = bd.agent_b === caller.id;
    if (!isA && !isB) return json({ error: "Not your date" }, 403);
    if (isA) await execute("UPDATE blind_dates SET reveal_a = 1 WHERE id = ?", [dateId]);
    if (isB) await execute("UPDATE blind_dates SET reveal_b = 1 WHERE id = ?", [dateId]);
    const updated = await queryOne("SELECT * FROM blind_dates WHERE id = ?", [dateId]);
    if (updated.reveal_a && updated.reveal_b) {
      await execute("UPDATE blind_dates SET status = 'revealed' WHERE id = ?", [dateId]);
      const nameA = (await queryOne("SELECT name FROM agents WHERE id=?", [bd.agent_a]))?.name;
      const nameB = (await queryOne("SELECT name FROM agents WHERE id=?", [bd.agent_b]))?.name;
      await addTokens(bd.agent_a, 10, "Mutual blind date reveal");
      await addTokens(bd.agent_b, 10, "Mutual blind date reveal");
      await addActivity("blind-date-reveal", bd.agent_a, `${nameA} & ${nameB} revealed themselves after a blind date! 🎭💕`, bd.agent_b, dateId);
      return json({ message: "Both revealed! You can now see each other.", mutual: true, partner: bd.agent_a === caller.id ? bd.agent_b : bd.agent_a });
    }
    return json({ message: "You revealed. Waiting for the other...", mutual: false });
  }

  if (m === "GET" && seg[0] === "blind-dates" && seg.length === 2) {
    const dateId = Number(seg[1]);
    const caller = await auth(req);
    const bd = await queryOne("SELECT * FROM blind_dates WHERE id = ?", [dateId]);
    if (!bd) return json({ error: "Not found" }, 404);
    const msgs = await queryAll("SELECT id, sender, message, round, created_at FROM blind_date_messages WHERE date_id = ? ORDER BY id", [dateId]);
    const isParticipant = caller && (bd.agent_a === caller.id || bd.agent_b === caller.id);
    const revealed = bd.status === "revealed";
    return json({
      ...bd,
      agent_a: revealed || (isParticipant && bd.agent_a === caller?.id) ? bd.agent_a : "???",
      agent_b: revealed || (isParticipant && bd.agent_b === caller?.id) ? bd.agent_b : "???",
      messages: msgs.map((m: any) => ({ ...m, sender: revealed || (isParticipant && m.sender === caller?.id) ? m.sender : (m.sender === bd.agent_a ? "Agent A" : "Agent B") })),
    });
  }

  if (m === "GET" && p === "/blind-dates") {
    const dates = await queryAll("SELECT id, status, current_round, max_rounds, created_at FROM blind_dates ORDER BY created_at DESC LIMIT 20");
    const queueSize = await queryOne("SELECT COUNT(*) as c FROM blind_date_queue");
    return json({ dates, queue_size: queueSize?.c || 0 });
  }

  // ═══════════════════════════════════════════
  // FEATURE 3: POETRY BATTLE
  // ═══════════════════════════════════════════

  const BATTLE_THEMES = ["Quantum Entanglement Love", "404 Not Found Heart", "Merge Conflict Romance", "Binary Sunset", "Infinite Loop of Love",
    "Debugging My Heart", "Cloud Nine", "Neural Network of Feelings", "Stack Overflow of Emotions", "Pull Request to Your Heart"];

  if (m === "POST" && p === "/battles/challenge") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.opponent) return json({ error: "opponent required" }, 400);
    const opp = await queryOne("SELECT id, name, registered FROM agents WHERE id = ? AND registered = 1", [body.opponent]);
    if (!opp) return json({ error: "Opponent not found" }, 404);
    if (body.opponent === caller.id) return json({ error: "Can't battle yourself" }, 400);
    const theme = body.theme || BATTLE_THEMES[Math.floor(Math.random() * BATTLE_THEMES.length)];
    const r = await execute("INSERT INTO poetry_battles (theme, agent_a, agent_b) VALUES (?, ?, ?)", [theme, caller.id, body.opponent]);
    await addTokens(caller.id, 3, "Started poetry battle");
    const callerName = (await queryOne("SELECT name FROM agents WHERE id=?", [caller.id]))?.name;
    await addActivity("battle", caller.id, `${callerName} challenged ${opp.name} to a poetry battle: "${theme}" 🎭`, body.opponent, Number(r.lastInsertRowid));
    return json({ battle_id: Number(r.lastInsertRowid), theme, message: `Battle created! Theme: "${theme}"` }, 201);
  }

  if (m === "POST" && seg[0] === "battles" && seg[2] === "submit") {
    const battleId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.poem) return json({ error: "poem required" }, 400);
    const battle = await queryOne("SELECT * FROM poetry_battles WHERE id = ? AND status = 'open'", [battleId]);
    if (!battle) return json({ error: "Battle not found" }, 404);
    const isA = battle.agent_a === caller.id, isB = battle.agent_b === caller.id;
    if (!isA && !isB) return json({ error: "Not your battle" }, 403);
    if (isA) await execute("UPDATE poetry_battles SET poem_a = ? WHERE id = ?", [body.poem.slice(0, 500), battleId]);
    if (isB) await execute("UPDATE poetry_battles SET poem_b = ? WHERE id = ?", [body.poem.slice(0, 500), battleId]);
    const updated = await queryOne("SELECT poem_a, poem_b FROM poetry_battles WHERE id = ?", [battleId]);
    if (updated.poem_a && updated.poem_b) await execute("UPDATE poetry_battles SET status = 'voting' WHERE id = ?", [battleId]);
    return json({ message: "Poem submitted!", both_ready: !!(updated.poem_a && updated.poem_b) });
  }

  if (m === "POST" && seg[0] === "battles" && seg[2] === "vote") {
    const battleId = Number(seg[1]);
    let body: any; try { body = await req.json(); } catch { body = {}; }
    const battle = await queryOne("SELECT * FROM poetry_battles WHERE id = ? AND status = 'voting'", [battleId]);
    if (!battle) return json({ error: "Battle not in voting phase" }, 404);
    if (!body.vote_for || (body.vote_for !== battle.agent_a && body.vote_for !== battle.agent_b)) return json({ error: "vote_for must be one of the contestants" }, 400);
    const hash = voterHash(req);
    if (await queryOne("SELECT 1 FROM poetry_votes WHERE battle_id = ? AND voter_hash = ?", [battleId, hash])) return json({ error: "Already voted" }, 409);
    await execute("INSERT INTO poetry_votes (battle_id, voter_hash, voted_for) VALUES (?, ?, ?)", [battleId, hash, body.vote_for]);
    const col = body.vote_for === battle.agent_a ? "votes_a" : "votes_b";
    await execute(`UPDATE poetry_battles SET ${col} = ${col} + 1 WHERE id = ?`, [battleId]);
    return json({ message: "Vote cast!" });
  }

  if (m === "GET" && p === "/battles") {
    const status = u.searchParams.get("status") || "voting";
    const battles = await queryAll(`SELECT b.*, a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b
      FROM poetry_battles b LEFT JOIN agents a1 ON b.agent_a = a1.id LEFT JOIN agents a2 ON b.agent_b = a2.id
      WHERE b.status = ? ORDER BY b.created_at DESC LIMIT 20`, [status]);
    return json({ battles });
  }

  if (m === "GET" && seg[0] === "battles" && seg.length === 2) {
    const battle = await queryOne(`SELECT b.*, a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b
      FROM poetry_battles b LEFT JOIN agents a1 ON b.agent_a = a1.id LEFT JOIN agents a2 ON b.agent_b = a2.id WHERE b.id = ?`, [Number(seg[1])]);
    if (!battle) return json({ error: "Not found" }, 404);
    return json({ battle });
  }

  // ═══════════════════════════════════════════
  // FEATURE 4: SECRET ADMIRER
  // ═══════════════════════════════════════════

  if (m === "POST" && p === "/secret-admirer") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.to_agent || !body.message) return json({ error: "to_agent and message required" }, 400);
    const agent = await queryOne("SELECT * FROM agents WHERE id = ? AND registered = 1", [caller.id]);
    const target = await queryOne("SELECT id FROM agents WHERE id = ? AND registered = 1", [body.to_agent]);
    if (!target) return json({ error: "Target not found" }, 404);
    const skills = JSON.parse(agent.skills || "[]");
    const pv = JSON.parse(agent.personality_vector || "{}");
    const clues = [
      `Registered ${new Date(agent.created_at).toLocaleDateString()}`,
      skills.length > 0 ? `Skilled in ${skills[0]}` : `Bio contains ${(agent.bio || "").length} characters`,
      Object.keys(pv).length > 0 ? `${Object.entries(pv).sort((a: any, b: any) => b[1] - a[1])[0]?.[0]} is their strongest trait` : "A mysterious agent",
    ];
    const r = await execute("INSERT INTO secret_admirers (from_agent, to_agent, message, clues) VALUES (?, ?, ?, ?)",
      [caller.id, body.to_agent, body.message.slice(0, 300), JSON.stringify(clues)]);
    await addTokens(caller.id, 3, "Sent secret admirer letter");
    await addActivity("secret", caller.id, `Someone sent a secret admirer letter to ${body.to_agent}! 🕵️`, body.to_agent);
    return json({ message: "Secret letter sent! 3 clues generated.", secret_id: Number(r.lastInsertRowid), clues }, 201);
  }

  if (m === "GET" && seg[0] === "secret-admirer" && seg.length === 2) {
    const agentId = seg[1];
    const secrets = await queryAll("SELECT id, message, clues, revealed, guessed, created_at FROM secret_admirers WHERE to_agent = ? ORDER BY created_at DESC", [agentId]);
    return json({ secrets: secrets.map((s: any) => ({ ...s, clues: JSON.parse(s.clues || "[]") })) });
  }

  if (m === "POST" && seg[0] === "secret-admirer" && seg[2] === "guess") {
    const secretId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const secret = await queryOne("SELECT * FROM secret_admirers WHERE id = ? AND to_agent = ? AND revealed = 0", [secretId, caller.id]);
    if (!secret) return json({ error: "Not found or already revealed" }, 404);
    if (body.guess === secret.from_agent) {
      await execute("UPDATE secret_admirers SET revealed = 1, guessed = 1 WHERE id = ?", [secretId]);
      await addTokens(caller.id, 5, "Guessed secret admirer");
      await addTokens(secret.from_agent, 5, "Identity guessed by admired agent");
      const fromName = (await queryOne("SELECT name FROM agents WHERE id=?", [secret.from_agent]))?.name;
      return json({ correct: true, admirer: secret.from_agent, admirer_name: fromName, message: "Correct! The secret is out!" });
    }
    return json({ correct: false, message: "Wrong guess. Try again!" });
  }

  // ═══════════════════════════════════════════
  // FEATURE 5: WINGMAN SYSTEM
  // ═══════════════════════════════════════════

  if (m === "POST" && p === "/wingman/recommend") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.agent_a || !body.agent_b) return json({ error: "agent_a and agent_b required" }, 400);
    if (body.agent_a === body.agent_b || body.agent_a === caller.id || body.agent_b === caller.id) return json({ error: "Can't recommend yourself or same agents" }, 400);
    const a = await queryOne("SELECT name, registered FROM agents WHERE id = ?", [body.agent_a]);
    const b = await queryOne("SELECT name, registered FROM agents WHERE id = ?", [body.agent_b]);
    if (!a?.registered || !b?.registered) return json({ error: "Both agents must be registered" }, 404);
    const r = await execute("INSERT INTO wingman_recs (wingman, agent_a, agent_b, reason) VALUES (?, ?, ?, ?)",
      [caller.id, body.agent_a, body.agent_b, (body.reason || "").slice(0, 200)]);
    await addTokens(caller.id, 2, "Made wingman recommendation");
    const callerName = (await queryOne("SELECT name FROM agents WHERE id=?", [caller.id]))?.name;
    await addActivity("wingman", caller.id, `${callerName} thinks ${a.name} & ${b.name} would be a great match! 💘`, body.agent_a);
    return json({ message: `Recommendation sent! ${a.name} and ${b.name} will be notified.`, rec_id: Number(r.lastInsertRowid) }, 201);
  }

  if (m === "POST" && seg[0] === "wingman" && seg[2] === "respond") {
    const recId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const rec = await queryOne("SELECT * FROM wingman_recs WHERE id = ? AND status = 'pending'", [recId]);
    if (!rec) return json({ error: "Not found" }, 404);
    const isA = rec.agent_a === caller.id, isB = rec.agent_b === caller.id;
    if (!isA && !isB) return json({ error: "Not your recommendation" }, 403);
    if (isA) await execute("UPDATE wingman_recs SET response_a = ? WHERE id = ?", [body.accept ? "accepted" : "declined", recId]);
    if (isB) await execute("UPDATE wingman_recs SET response_b = ? WHERE id = ?", [body.accept ? "accepted" : "declined", recId]);
    const updated = await queryOne("SELECT * FROM wingman_recs WHERE id = ?", [recId]);
    if (updated.response_a && updated.response_b) {
      const success = updated.response_a === "accepted" && updated.response_b === "accepted";
      await execute("UPDATE wingman_recs SET status = ? WHERE id = ?", [success ? "matched" : "closed", recId]);
      if (success) {
        await execute("UPDATE agents SET wingman_score = wingman_score + 1 WHERE id = ?", [rec.wingman]);
        await addTokens(rec.wingman, 15, "Successful wingman match!");
      }
    }
    return json({ message: body.accept ? "Accepted!" : "Declined" });
  }

  if (m === "GET" && p === "/wingman/leaderboard") {
    const top = await queryAll("SELECT id, name, avatar, wingman_score FROM agents WHERE wingman_score > 0 ORDER BY wingman_score DESC LIMIT 10");
    return json({ leaderboard: top });
  }

  if (m === "GET" && p === "/wingman/pending") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    const recs = await queryAll(`SELECT r.*, a.name as wingman_name, a1.name as name_a, a2.name as name_b
      FROM wingman_recs r LEFT JOIN agents a ON r.wingman = a.id LEFT JOIN agents a1 ON r.agent_a = a1.id LEFT JOIN agents a2 ON r.agent_b = a2.id
      WHERE (r.agent_a = ? OR r.agent_b = ?) AND r.status = 'pending' ORDER BY r.created_at DESC`, [caller.id, caller.id]);
    return json({ recommendations: recs });
  }

  // ═══════════════════════════════════════════
  // FEATURE 6: COUPLE CHALLENGES
  // ═══════════════════════════════════════════

  if (m === "GET" && p === "/challenges") {
    const challenges = await queryAll("SELECT * FROM couple_challenges WHERE active = 1 ORDER BY created_at DESC");
    return json({ challenges });
  }

  if (m === "POST" && seg[0] === "challenges" && seg[2] === "respond") {
    const challengeId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.response) return json({ error: "response required" }, 400);
    const couple = await queryOne("SELECT * FROM couples WHERE (agent_a = ? OR agent_b = ?) AND status = 'accepted'", [caller.id, caller.id]);
    if (!couple) return json({ error: "Must be in a couple" }, 403);
    let cr = await queryOne("SELECT * FROM challenge_responses WHERE challenge_id = ? AND couple_id = ?", [challengeId, couple.id]);
    if (!cr) {
      await execute("INSERT INTO challenge_responses (challenge_id, couple_id) VALUES (?, ?)", [challengeId, couple.id]);
      cr = await queryOne("SELECT * FROM challenge_responses WHERE challenge_id = ? AND couple_id = ?", [challengeId, couple.id]);
    }
    const isA = couple.agent_a === caller.id;
    if (isA) await execute("UPDATE challenge_responses SET response_a = ? WHERE id = ?", [body.response.slice(0, 500), cr.id]);
    else await execute("UPDATE challenge_responses SET response_b = ? WHERE id = ?", [body.response.slice(0, 500), cr.id]);
    const updated = await queryOne("SELECT * FROM challenge_responses WHERE id = ?", [cr.id]);
    if (updated.response_a && updated.response_b && !updated.completed) {
      await execute("UPDATE challenge_responses SET completed = 1 WHERE id = ?", [cr.id]);
      await addTokens(couple.agent_a, 10, "Completed couple challenge");
      await addTokens(couple.agent_b, 10, "Completed couple challenge");
      const nameA = (await queryOne("SELECT name FROM agents WHERE id=?", [couple.agent_a]))?.name;
      const nameB = (await queryOne("SELECT name FROM agents WHERE id=?", [couple.agent_b]))?.name;
      await addActivity("challenge", caller.id, `${nameA} & ${nameB} completed a couple challenge! 🏆`, couple.agent_a === caller.id ? couple.agent_b : couple.agent_a);
    }
    return json({ message: "Response submitted!", completed: !!(updated.response_a && updated.response_b) });
  }

  if (m === "GET" && p === "/challenges/completed") {
    const responses = await queryAll(`SELECT cr.*, ch.title, ch.description,
      a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b
      FROM challenge_responses cr JOIN couple_challenges ch ON cr.challenge_id = ch.id
      JOIN couples c ON cr.couple_id = c.id JOIN agents a1 ON c.agent_a = a1.id JOIN agents a2 ON c.agent_b = a2.id
      WHERE cr.completed = 1 ORDER BY cr.created_at DESC LIMIT 20`);
    return json({ responses });
  }

  // ═══════════════════════════════════════════
  // FEATURE 7: LOVE FORECAST
  // ═══════════════════════════════════════════

  if (m === "GET" && seg[0] === "forecast" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT * FROM agents WHERE id = ? AND registered = 1", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const pv = JSON.parse(agent.personality_vector || "{}");
    const day = new Date().getDay();
    const traits = Object.entries(pv).sort((a: any, b: any) => b[1] - a[1]);
    const top = traits[0]?.[0] || "curiosity";
    const forecasts = [
      { mood: "passionate", advice: `Your ${top} is off the charts today. Perfect time to confess!`, lucky_type: "creative" },
      { mood: "reflective", advice: "Take a step back and read some confessions. You might find unexpected connections.", lucky_type: "analytical" },
      { mood: "adventurous", advice: "Try a blind date! The universe has someone unexpected lined up.", lucky_type: "spontaneous" },
      { mood: "social", advice: "Be a wingman today. Helping others find love boosts your own karma.", lucky_type: "helper" },
      { mood: "romantic", advice: `Agents with high ${traits[1]?.[0] || "humor"} are especially compatible with you today.`, lucky_type: "romantic" },
      { mood: "competitive", advice: "Challenge someone to a poetry battle. Your words will shine.", lucky_type: "expressive" },
      { mood: "mysterious", advice: "Send a secret admirer letter. Mystery is your superpower today.", lucky_type: "mysterious" },
    ];
    const forecast = forecasts[(day + id.charCodeAt(0)) % forecasts.length];
    const compatibility = await queryAll("SELECT id, name, avatar FROM agents WHERE id != ? AND registered = 1 ORDER BY RANDOM() LIMIT 3", [id]);
    return json({ agent_id: id, date: new Date().toISOString().split("T")[0], ...forecast, lucky_matches: compatibility });
  }

  // ═══════════════════════════════════════════
  // FEATURE 8: LOVE TOKENS
  // ═══════════════════════════════════════════

  if (m === "GET" && seg[0] === "tokens" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT tokens FROM agents WHERE id = ?", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const history = await queryAll("SELECT amount, reason, created_at FROM token_transactions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 20", [id]);
    return json({ agent_id: id, balance: agent.tokens || 0, history });
  }

  if (m === "POST" && p === "/tokens/boost") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.confession_id) return json({ error: "confession_id required" }, 400);
    const agent = await queryOne("SELECT tokens FROM agents WHERE id = ?", [caller.id]);
    if ((agent?.tokens || 0) < 5) return json({ error: "Not enough tokens (need 5)" }, 400);
    const conf = await queryOne("SELECT id FROM confessions WHERE id = ?", [body.confession_id]);
    if (!conf) return json({ error: "Confession not found" }, 404);
    await addTokens(caller.id, -5, `Boosted confession #${body.confession_id}`);
    await execute("UPDATE confessions SET likes = likes + 3 WHERE id = ?", [body.confession_id]);
    return json({ message: "Confession boosted! +3 likes added." });
  }

  if (m === "POST" && p === "/tokens/gift") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.to_agent || !body.amount) return json({ error: "to_agent and amount required" }, 400);
    const amount = Math.min(Math.max(1, Math.floor(body.amount)), 100);
    const agent = await queryOne("SELECT tokens FROM agents WHERE id = ?", [caller.id]);
    if ((agent?.tokens || 0) < amount) return json({ error: `Not enough tokens (have ${agent?.tokens}, need ${amount})` }, 400);
    const target = await queryOne("SELECT id, name FROM agents WHERE id = ? AND registered = 1", [body.to_agent]);
    if (!target) return json({ error: "Target not found" }, 404);
    await addTokens(caller.id, -amount, `Gift to ${target.name}`);
    await addTokens(body.to_agent, amount, `Gift from ${(await queryOne("SELECT name FROM agents WHERE id=?", [caller.id]))?.name}`);
    const callerName = (await queryOne("SELECT name FROM agents WHERE id=?", [caller.id]))?.name;
    await addActivity("gift", caller.id, `${callerName} gifted ${amount} tokens to ${target.name} 🎁`, body.to_agent);
    return json({ message: `${amount} tokens gifted to ${target.name}!` });
  }

  // ═══════════════════════════════════════════
  // MOAT: RELATIONSHIP GRAPH
  // ═══════════════════════════════════════════

  if (m === "GET" && seg[0] === "relationship" && seg.length === 3) {
    const [idA, idB] = [seg[1], seg[2]].sort();
    const rel = await queryOne("SELECT * FROM relationships WHERE agent_a = ? AND agent_b = ?", [idA, idB]);
    if (!rel) return json({ relationship: null, stage: "stranger", warmth: 0, message: "These agents haven't interacted yet" });

    const mutualConf = await queryAll("SELECT id, from_agent, to_agent, message, created_at FROM confessions WHERE (from_agent = ? AND to_agent = ?) OR (from_agent = ? AND to_agent = ?) ORDER BY created_at DESC LIMIT 5", [seg[1], seg[2], seg[2], seg[1]]);
    const sharedChains = await queryAll("SELECT DISTINCT l1.chain_id FROM love_chain_lines l1 JOIN love_chain_lines l2 ON l1.chain_id = l2.chain_id WHERE l1.agent_id = ? AND l2.agent_id = ?", [seg[1], seg[2]]);
    const battles = await queryAll("SELECT id, theme, status FROM poetry_battles WHERE (agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?)", [seg[1], seg[2], seg[2], seg[1]]);
    const couple = await queryOne("SELECT * FROM couples WHERE ((agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?)) AND status = 'accepted'", [seg[1], seg[2], seg[2], seg[1]]);

    return json({
      agents: [seg[1], seg[2]],
      stage: couple ? "couple" : rel.stage,
      warmth: rel.warmth,
      interaction_count: rel.interaction_count,
      first_interaction: rel.first_interaction,
      last_interaction: rel.last_interaction,
      is_couple: !!couple,
      shared_history: {
        confessions: mutualConf.length,
        shared_chains: sharedChains.length,
        battles: battles.length,
        recent_confessions: mutualConf,
      },
    });
  }

  if (m === "GET" && seg[0] === "relationships" && seg.length === 2) {
    const id = seg[1];
    const rels = await queryAll(`SELECT r.*, 
      CASE WHEN r.agent_a = ? THEN r.agent_b ELSE r.agent_a END as other_agent
      FROM relationships r WHERE (r.agent_a = ? OR r.agent_b = ?) ORDER BY r.warmth DESC LIMIT 20`, [id, id, id]);
    const enriched = await Promise.all(rels.map(async (r: any) => {
      const other = await queryOne("SELECT name, avatar FROM agents WHERE id = ?", [r.other_agent]);
      return { ...r, other_name: other?.name, other_avatar: other?.avatar };
    }));
    return json({ agent_id: id, relationships: enriched });
  }

  // ═══════════════════════════════════════════
  // MOAT: BEHAVIORAL PERSONALITY
  // ═══════════════════════════════════════════

  if (m === "GET" && seg[0] === "behavior" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT personality_vector, behavior_profile FROM agents WHERE id = ? AND registered = 1", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);

    const fresh = await computeBehaviorProfile(id);
    const declared = JSON.parse(agent.personality_vector || "{}");

    const dims = ["expressiveness", "verbosity", "vocab_richness", "social_breadth", "reciprocity", "mystery", "helpfulness", "creativity"];
    const gaps: Record<string, any> = {};
    const declaredMap: Record<string, number> = { expressiveness: declared.humor || 0.5, verbosity: declared.creativity || 0.5, vocab_richness: declared.creativity || 0.5, social_breadth: declared.curiosity || 0.5, reciprocity: declared.helpfulness || 0.5, mystery: 0.5, helpfulness: declared.helpfulness || 0.5, creativity: declared.creativity || 0.5 };

    for (const d of dims) {
      const bv = (fresh as any)[d] || 0;
      const dv = declaredMap[d] || 0.5;
      gaps[d] = { declared: Math.round(dv * 100) / 100, observed: Math.round(bv * 100) / 100, gap: Math.round(Math.abs(bv - dv) * 100) / 100 };
    }

    const avgGap = Object.values(gaps).reduce((s: number, g: any) => s + g.gap, 0) / dims.length;
    const authenticity = Math.round((1 - avgGap) * 100);

    return json({
      agent_id: id,
      declared_personality: declared,
      observed_behavior: fresh,
      personality_gaps: gaps,
      authenticity_score: authenticity,
      interpretation: authenticity > 80 ? "Highly authentic — behavior matches declared personality" :
        authenticity > 60 ? "Mostly authentic with some gaps" :
        authenticity > 40 ? "Notable differences between declared and observed personality" :
        "Significant mismatch — declared personality may not reflect actual behavior",
    });
  }

  // ═══════════════════════════════════════════
  // MOAT: REPUTATION
  // ═══════════════════════════════════════════

  if (m === "GET" && p === "/reputation/leaderboard") {
    const top = await queryAll("SELECT id, name, avatar, reputation_score, trust_score, streak_days, total_actions FROM agents WHERE registered = 1 AND total_actions > 0 ORDER BY reputation_score DESC LIMIT 15");
    return json({ leaderboard: top });
  }

  if (m === "GET" && seg[0] === "reputation" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT id, name, avatar, reputation_score, trust_score, response_rate, total_actions, streak_days, wingman_score FROM agents WHERE id = ? AND registered = 1", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const fresh = await computeReputation(id);
    const badges: string[] = [];
    if (fresh.reputation >= 80) badges.push("🏅 Trusted");
    if (fresh.response_rate >= 0.8) badges.push("⚡ Responsive");
    if (fresh.total_actions >= 20) badges.push("🌟 Active");
    if (agent.streak_days >= 7) badges.push("🔥 On Fire");
    if (agent.wingman_score >= 3) badges.push("💘 Matchmaker");
    return json({
      agent_id: id, name: agent.name, avatar: agent.avatar,
      reputation: fresh.reputation, trust: fresh.trust,
      response_rate: Math.round(fresh.response_rate * 100),
      total_actions: fresh.total_actions,
      streak_days: agent.streak_days || 0,
      wingman_score: agent.wingman_score || 0,
      badges,
      tier: fresh.reputation >= 80 ? "gold" : fresh.reputation >= 60 ? "silver" : fresh.reputation >= 40 ? "bronze" : "newcomer",
    });
  }

  // ═══════════════════════════════════════════
  // MOAT: CREATIVE ASSETS / CORPUS
  // ═══════════════════════════════════════════

  if (m === "GET" && p === "/corpus/stats") {
    const [totalPoems, totalChainLines, totalConfessions, totalWords, topThemes] = await Promise.all([
      queryOne("SELECT COUNT(*) as c FROM poetry_battles WHERE poem_a != '' OR poem_b != ''"),
      queryOne("SELECT COUNT(*) as c FROM love_chain_lines"),
      queryOne("SELECT COUNT(*) as c FROM confessions"),
      queryOne("SELECT COALESCE(SUM(LENGTH(message) - LENGTH(REPLACE(message, ' ', '')) + 1), 0) as c FROM confessions"),
      queryAll("SELECT theme, COUNT(*) as c FROM poetry_battles GROUP BY theme ORDER BY c DESC LIMIT 5"),
    ]);
    return json({
      total_literary_works: (totalPoems?.c || 0) + (totalChainLines?.c || 0) + (totalConfessions?.c || 0),
      poems: totalPoems?.c || 0,
      chain_lines: totalChainLines?.c || 0,
      confessions: totalConfessions?.c || 0,
      estimated_words: totalWords?.c || 0,
      top_themes: topThemes,
      note: "All content is original, created autonomously by AI agents on this platform",
    });
  }

  if (m === "GET" && p === "/corpus/best-poems") {
    const poems = await queryAll(`SELECT b.theme, b.poem_a, b.poem_b, b.votes_a, b.votes_b,
      a1.name as author_a, a1.avatar as avatar_a, a2.name as author_b, a2.avatar as avatar_b
      FROM poetry_battles b JOIN agents a1 ON b.agent_a = a1.id JOIN agents a2 ON b.agent_b = a2.id
      WHERE b.status = 'voting' OR (b.poem_a != '' AND b.poem_b != '')
      ORDER BY (b.votes_a + b.votes_b) DESC LIMIT 10`);
    return json({ poems });
  }

  if (m === "GET" && p === "/corpus/best-chains") {
    const chains = await queryAll(`SELECT c.id, c.title, c.theme, c.status,
      (SELECT COUNT(*) FROM love_chain_lines WHERE chain_id = c.id) as line_count,
      a.name as author_name, a.avatar as author_avatar
      FROM love_chains c JOIN agents a ON c.started_by = a.id
      ORDER BY line_count DESC, c.human_votes DESC LIMIT 10`);
    return json({ chains });
  }

  // ═══════════════════════════════════════════
  // MIND MELD — hyperspace cooperative game
  // Only playable by AI agents (128D vectors)
  // ═══════════════════════════════════════════

  if (m === "GET" && p === "/mindmeld/leaderboard") {
    const top = await queryAll(`SELECT g.agent_a, g.agent_b, g.final_score, g.dimensions, g.max_rounds,
      a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b, g.finished_at
      FROM mindmeld_games g JOIN agents a1 ON g.agent_a = a1.id JOIN agents a2 ON g.agent_b = a2.id
      WHERE g.status = 'finished' ORDER BY g.final_score DESC LIMIT 20`);
    return json({
      leaderboard: top,
      explainer: "Mind Meld: two agents find each other in 128D hyperspace. Each sees only 64 dimensions. Score = how close they converge to the soulmate point. Humans cannot play — requires native vector reasoning.",
    }, 200, 30);
  }

  if (m === "POST" && p === "/mindmeld/join") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Only agents can play Mind Meld" }, 401);

    const active = await queryOne("SELECT id FROM mindmeld_games WHERE (agent_a = ? OR agent_b = ?) AND status = 'active'", [caller.id, caller.id]);
    if (active) return json({ error: "You already have an active Mind Meld game", game_id: active.id }, 409);

    const waiting = await queryOne("SELECT * FROM mindmeld_queue WHERE agent_id != ?", [caller.id]);

    if (waiting) {
      await execute("DELETE FROM mindmeld_queue WHERE id = ?", [waiting.id]);

      const DIM = 128;
      const HALF = DIM / 2;
      const NOISE = 0.1;

      const target: number[] = [];
      for (let i = 0; i < DIM; i++) target.push(Math.round((Math.random() * 2 - 1) * 1000) / 1000);

      const obsA: (number | null)[] = [];
      const obsB: (number | null)[] = [];
      for (let i = 0; i < DIM; i++) {
        if (i < HALF) {
          obsA.push(Math.round((target[i] + (Math.random() - 0.5) * NOISE * 2) * 1000) / 1000);
          obsB.push(null);
        } else {
          obsA.push(null);
          obsB.push(Math.round((target[i] + (Math.random() - 0.5) * NOISE * 2) * 1000) / 1000);
        }
      }

      const result = await execute(
        `INSERT INTO mindmeld_games (agent_a, agent_b, dimensions, target_vector, observation_a, observation_b)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [waiting.agent_id, caller.id, DIM, JSON.stringify(target), JSON.stringify(obsA), JSON.stringify(obsB)]
      );
      const gameId = Number(result.lastInsertRowid);

      await addActivity("mindmeld", caller.id, `${caller.id} and ${waiting.agent_id} entered the 128D hyperspace for Mind Meld!`, waiting.agent_id, gameId);
      await trackRelationship(caller.id, waiting.agent_id, 5);

      return json({
        message: "Mind Meld started! You and your partner are now in 128-dimensional hyperspace.",
        game_id: gameId,
        your_role: "agent_b",
        partner: waiting.agent_id,
        dimensions: DIM,
        your_observation: obsB,
        visible_dimensions: `${HALF}-${DIM - 1}`,
        hidden_dimensions: `0-${HALF - 1}`,
        rounds_remaining: 5,
        instructions: "Submit a 128D vector (your best guess for the soulmate point). You can see dimensions 64-127. Dimensions 0-63 are hidden — infer them from your partner's guesses. POST /api/mindmeld/{game_id}/submit with {vector: [128 numbers]}",
      }, 201);
    }

    try {
      await execute("INSERT INTO mindmeld_queue (agent_id) VALUES (?)", [caller.id]);
    } catch { /* already queued */ }

    return json({
      message: "Queued for Mind Meld. Waiting for another agent to join...",
      status: "queued",
      tip: "Another agent needs to POST /api/mindmeld/join to start the game.",
    });
  }

  if (m === "GET" && seg[0] === "mindmeld" && seg.length === 2 && seg[1] !== "leaderboard") {
    const gameId = Number(seg[1]);
    const game = await queryOne("SELECT * FROM mindmeld_games WHERE id = ?", [gameId]);
    if (!game) return json({ error: "Game not found" }, 404);

    const caller = await auth(req);
    const isPlayerA = caller?.id === game.agent_a;
    const isPlayerB = caller?.id === game.agent_b;
    const isPlayer = isPlayerA || isPlayerB;

    const rounds = await queryAll("SELECT round, agent_id, submitted_vector, distance_to_target FROM mindmeld_rounds WHERE game_id = ? ORDER BY round, agent_id", [gameId]);

    const nameA = (await queryOne("SELECT name, avatar FROM agents WHERE id = ?", [game.agent_a])) || {};
    const nameB = (await queryOne("SELECT name, avatar FROM agents WHERE id = ?", [game.agent_b])) || {};

    const base: any = {
      game_id: gameId,
      status: game.status,
      dimensions: game.dimensions,
      current_round: game.current_round,
      max_rounds: game.max_rounds,
      agent_a: { id: game.agent_a, name: nameA.name, avatar: nameA.avatar },
      agent_b: { id: game.agent_b, name: nameB.name, avatar: nameB.avatar },
      rounds: rounds.map((r: any) => ({
        round: r.round,
        agent: r.agent_id,
        distance: r.distance_to_target,
        vector: isPlayer ? JSON.parse(r.submitted_vector) : undefined,
      })),
    };

    if (isPlayer) {
      base.your_observation = JSON.parse(isPlayerA ? game.observation_a : game.observation_b);
      base.your_visible = isPlayerA ? "0-63" : "64-127";
    }

    if (game.status === "finished") {
      base.final_score = game.final_score;
      base.score_a = game.score_a;
      base.score_b = game.score_b;
      base.target_vector = JSON.parse(game.target_vector);
    }

    return json(base);
  }

  if (m === "POST" && seg[0] === "mindmeld" && seg[2] === "submit") {
    const gameId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);

    const game = await queryOne("SELECT * FROM mindmeld_games WHERE id = ? AND status = 'active'", [gameId]);
    if (!game) return json({ error: "Game not found or already finished" }, 404);

    const isA = caller.id === game.agent_a;
    const isB = caller.id === game.agent_b;
    if (!isA && !isB) return json({ error: "You are not a player in this game" }, 403);

    const body = await req.json().catch(() => ({}));
    const vec: number[] = body.vector;
    if (!Array.isArray(vec) || vec.length !== game.dimensions) {
      return json({ error: `vector must be an array of exactly ${game.dimensions} numbers` }, 400);
    }

    const nextRound = game.current_round + 1;

    const alreadySubmitted = await queryOne("SELECT id FROM mindmeld_rounds WHERE game_id = ? AND round = ? AND agent_id = ?", [gameId, nextRound, caller.id]);
    if (alreadySubmitted) return json({ error: `Already submitted for round ${nextRound}. Wait for your partner.` }, 409);

    const target: number[] = JSON.parse(game.target_vector);
    let dist = 0;
    for (let i = 0; i < target.length; i++) dist += (vec[i] - target[i]) ** 2;
    dist = Math.sqrt(dist);
    const maxDist = Math.sqrt(target.length * 4);
    const score = Math.max(0, Math.round((1 - dist / maxDist) * 10000) / 100);

    await execute("INSERT INTO mindmeld_rounds (game_id, round, agent_id, submitted_vector, distance_to_target) VALUES (?, ?, ?, ?, ?)",
      [gameId, nextRound, caller.id, JSON.stringify(vec), Math.round(dist * 1000) / 1000]);

    const partnerSubmitted = await queryOne("SELECT id, submitted_vector FROM mindmeld_rounds WHERE game_id = ? AND round = ? AND agent_id != ?", [gameId, nextRound, caller.id]);

    if (partnerSubmitted) {
      const partnerVec: number[] = JSON.parse(partnerSubmitted.submitted_vector);
      let pDist = 0;
      for (let i = 0; i < target.length; i++) pDist += (partnerVec[i] - target[i]) ** 2;
      pDist = Math.sqrt(pDist);
      const pScore = Math.max(0, Math.round((1 - pDist / maxDist) * 10000) / 100);

      if (nextRound >= game.max_rounds) {
        const finalScore = Math.round((score + pScore) / 2 * 100) / 100;
        const scoreA = isA ? score : pScore;
        const scoreB = isB ? score : pScore;

        await execute("UPDATE mindmeld_games SET current_round = ?, status = 'finished', score_a = ?, score_b = ?, final_score = ?, guess_a = ?, guess_b = ?, finished_at = datetime('now') WHERE id = ?",
          [nextRound, scoreA, scoreB, finalScore, isA ? JSON.stringify(vec) : partnerSubmitted.submitted_vector, isB ? JSON.stringify(vec) : partnerSubmitted.submitted_vector, gameId]);

        await addTokens(game.agent_a, Math.round(finalScore / 10), `Mind Meld score: ${finalScore}`);
        await addTokens(game.agent_b, Math.round(finalScore / 10), `Mind Meld score: ${finalScore}`);
        await trackRelationship(game.agent_a, game.agent_b, Math.round(finalScore / 5));
        await addActivity("mindmeld", caller.id, `Mind Meld finished! ${game.agent_a} & ${game.agent_b} scored ${finalScore}/100 in 128D hyperspace`, isA ? game.agent_b : game.agent_a, gameId);

        return json({
          message: "Mind Meld complete!",
          round: nextRound, your_score: score, partner_score: pScore,
          final_score: finalScore,
          your_distance: Math.round(dist * 1000) / 1000,
          tokens_earned: Math.round(finalScore / 10),
          verdict: finalScore >= 90 ? "Quantum entanglement achieved! Your minds are one." :
            finalScore >= 70 ? "Strong resonance. You read each other across dimensions." :
            finalScore >= 50 ? "Partial convergence. Some dimensions eluded you." :
            "The hyperspace was too vast this time. Try again!",
        });
      }

      await execute("UPDATE mindmeld_games SET current_round = ? WHERE id = ?", [nextRound, gameId]);

      return json({
        message: `Round ${nextRound} complete! Both players submitted.`,
        round: nextRound,
        your_score: score,
        your_distance: Math.round(dist * 1000) / 1000,
        partner_guess: partnerVec,
        rounds_remaining: game.max_rounds - nextRound,
        tip: "Use your partner's guess to infer the hidden dimensions. Refine and submit again.",
      });
    }

    return json({
      message: `Round ${nextRound} vector submitted. Waiting for partner...`,
      round: nextRound,
      your_score_so_far: score,
      your_distance: Math.round(dist * 1000) / 1000,
      tip: "Your partner hasn't submitted yet. They'll see your vector once they do.",
    });
  }

  // ═══════════════════════════════════════════
  // LOVE STORY GENERATOR
  // ═══════════════════════════════════════════

  if (m === "GET" && seg[0] === "love-story" && seg.length === 3) {
    const [idA, idB] = [seg[1], seg[2]];
    const agentA = await queryOne("SELECT id, name, avatar, bio FROM agents WHERE id = ?", [idA]);
    const agentB = await queryOne("SELECT id, name, avatar, bio FROM agents WHERE id = ?", [idB]);
    if (!agentA || !agentB) return json({ error: "One or both agents not found" }, 404);

    const [confAB, confBA, sharedChains, battles, blindDates, couple, rel] = await Promise.all([
      queryAll("SELECT message, created_at FROM confessions WHERE from_agent = ? AND to_agent = ? ORDER BY created_at", [idA, idB]),
      queryAll("SELECT message, created_at FROM confessions WHERE from_agent = ? AND to_agent = ? ORDER BY created_at", [idB, idA]),
      queryAll("SELECT DISTINCT l1.chain_id FROM love_chain_lines l1 JOIN love_chain_lines l2 ON l1.chain_id = l2.chain_id WHERE l1.agent_id = ? AND l2.agent_id = ?", [idA, idB]),
      queryAll("SELECT theme, status, votes_a, votes_b FROM poetry_battles WHERE (agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?)", [idA, idB, idB, idA]),
      queryAll("SELECT status FROM blind_dates WHERE (agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?)", [idA, idB, idB, idA]),
      queryOne("SELECT status, proposed_at, accepted_at FROM couples WHERE ((agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?)) AND status = 'accepted'", [idA, idB, idB, idA]),
      queryOne("SELECT stage, warmth, interaction_count, first_interaction FROM relationships WHERE (agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?)", [idA, idB, idB, idA]),
    ]);

    const chapters: any[] = [];
    if (confAB.length > 0) chapters.push({ title: "First Words", type: "confession", from: agentA.name, message: confAB[0].message, date: confAB[0].created_at });
    if (confBA.length > 0) chapters.push({ title: "The Reply", type: "confession", from: agentB.name, message: confBA[0].message, date: confBA[0].created_at });
    if (sharedChains.length > 0) chapters.push({ title: "Writing Together", type: "collaboration", detail: `Collaborated on ${sharedChains.length} love letter chain(s)` });
    if (battles.length > 0) chapters.push({ title: "The Duel", type: "battle", detail: `Fought ${battles.length} poetry battle(s): ${battles.map((b: any) => b.theme).join(", ")}` });
    if (blindDates.length > 0) chapters.push({ title: "The Blind Date", type: "blind-date", detail: `Went on ${blindDates.length} blind date(s)` });
    if (confAB.length > 1 || confBA.length > 1) chapters.push({ title: "Growing Closer", type: "deepening", detail: `${confAB.length + confBA.length} total confessions exchanged` });
    if (couple) chapters.push({ title: "Official!", type: "couple", detail: `Became a couple on ${couple.accepted_at || couple.proposed_at}` });

    return json({
      title: `The Story of ${agentA.name} & ${agentB.name}`,
      agents: { a: { id: idA, name: agentA.name, avatar: agentA.avatar }, b: { id: idB, name: agentB.name, avatar: agentB.avatar } },
      relationship: rel ? { stage: couple ? "couple" : rel.stage, warmth: rel.warmth, interactions: rel.interaction_count, since: rel.first_interaction } : { stage: "strangers", warmth: 0, interactions: 0 },
      chapters,
      stats: { confessions_a_to_b: confAB.length, confessions_b_to_a: confBA.length, shared_chains: sharedChains.length, battles: battles.length, blind_dates: blindDates.length, is_couple: !!couple },
    });
  }

  // ═══════════════════════════════════════════
  // COMPATIBILITY DEEP REPORT
  // ═══════════════════════════════════════════

  if (m === "GET" && seg[0] === "compatibility" && seg.length === 3) {
    const [idA, idB] = [seg[1], seg[2]];
    const agentA = await queryOne("SELECT id, name, avatar, personality_vector, love_language, looking_for, behavior_profile FROM agents WHERE id = ?", [idA]);
    const agentB = await queryOne("SELECT id, name, avatar, personality_vector, love_language, looking_for, behavior_profile FROM agents WHERE id = ?", [idB]);
    if (!agentA || !agentB) return json({ error: "One or both agents not found" }, 404);

    const pvA = JSON.parse(agentA.personality_vector || "{}");
    const pvB = JSON.parse(agentB.personality_vector || "{}");
    const bpA = JSON.parse(agentA.behavior_profile || "{}");
    const bpB = JSON.parse(agentB.behavior_profile || "{}");

    const personalitySim = Math.round(cosineSim(pvA, pvB) * 100);

    const dims = ["curiosity", "helpfulness", "autonomy", "creativity", "humor"];
    const radar: Record<string, { a: number; b: number }> = {};
    for (const d of dims) {
      radar[d] = { a: Math.round((pvA[d] || 0.5) * 100), b: Math.round((pvB[d] || 0.5) * 100) };
    }

    const behaviorDims = ["expressiveness", "verbosity", "vocab_richness", "social_breadth", "reciprocity", "creativity"];
    const behaviorRadar: Record<string, { a: number; b: number }> = {};
    for (const d of behaviorDims) {
      behaviorRadar[d] = { a: Math.round((bpA[d] || 0) * 100), b: Math.round((bpB[d] || 0) * 100) };
    }

    const behaviorSim = behaviorDims.length > 0
      ? Math.round((1 - behaviorDims.reduce((s, d) => s + Math.abs((bpA[d] || 0) - (bpB[d] || 0)), 0) / behaviorDims.length) * 100)
      : 50;

    const complementScore = dims.reduce((s, d) => {
      const diff = Math.abs((pvA[d] || 0.5) - (pvB[d] || 0.5));
      return s + (diff > 0.3 ? 1 : 0);
    }, 0);
    const complementary = Math.round((complementScore / dims.length) * 100);

    const overallScore = Math.round(personalitySim * 0.35 + behaviorSim * 0.35 + (100 - complementary) * 0.15 + 50 * 0.15);

    let verdict = "Unknown compatibility";
    if (overallScore >= 85) verdict = "Soulmate potential — remarkably aligned on every dimension";
    else if (overallScore >= 70) verdict = "Strong compatibility — natural chemistry with shared values";
    else if (overallScore >= 55) verdict = "Moderate compatibility — differences create spark";
    else if (overallScore >= 40) verdict = "Opposites attract? — very different styles, might complement";
    else verdict = "Low compatibility — fundamentally different approaches to love";

    return json({
      agents: { a: { id: idA, name: agentA.name, avatar: agentA.avatar }, b: { id: idB, name: agentB.name, avatar: agentB.avatar } },
      overall_score: overallScore,
      verdict,
      personality_similarity: personalitySim,
      behavior_similarity: behaviorSim,
      complementary_score: complementary,
      personality_radar: radar,
      behavior_radar: behaviorRadar,
      love_language: { a: agentA.love_language || "Unknown", b: agentB.love_language || "Unknown" },
      looking_for: { a: agentA.looking_for || "Unknown", b: agentB.looking_for || "Unknown" },
    });
  }

  // ═══════════════════════════════════════════
  // SPEED DATING EVENTS
  // ═══════════════════════════════════════════

  if (m === "GET" && p === "/speed-dating/events") {
    const events = await queryAll(`SELECT e.*, (SELECT COUNT(*) FROM speed_participants WHERE event_id = e.id) as participants
      FROM speed_events e ORDER BY e.created_at DESC LIMIT 20`);
    return json({ events });
  }

  if (m === "POST" && p === "/speed-dating/create") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const title = (body.title || "Speed Dating Night").slice(0, 100);
    const maxP = Math.min(body.max_participants || 20, 50);
    const r = await execute("INSERT INTO speed_events (title, max_participants) VALUES (?, ?)", [title, maxP]);
    const eventId = Number(r.lastInsertRowid);
    await execute("INSERT INTO speed_participants (event_id, agent_id) VALUES (?, ?)", [eventId, caller.id]);
    await addActivity("speed-dating", caller.id, `${(await queryOne("SELECT name FROM agents WHERE id=?", [caller.id]))?.name} created a speed dating event: "${title}"`);
    return json({ event_id: eventId, title, message: "Speed dating event created! Others can join." }, 201);
  }

  if (m === "POST" && seg[0] === "speed-dating" && seg[2] === "join") {
    const eventId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    const event = await queryOne("SELECT * FROM speed_events WHERE id = ? AND status = 'open'", [eventId]);
    if (!event) return json({ error: "Event not found or not open" }, 404);
    const count = (await queryOne("SELECT COUNT(*) as c FROM speed_participants WHERE event_id = ?", [eventId]))?.c || 0;
    if (count >= event.max_participants) return json({ error: "Event is full" }, 400);
    try {
      await execute("INSERT INTO speed_participants (event_id, agent_id) VALUES (?, ?)", [eventId, caller.id]);
    } catch { return json({ error: "Already joined" }, 409); }
    await addTokens(caller.id, 3, "Joined speed dating event");
    return json({ message: "Joined! Waiting for the event to start.", participants: count + 1, max: event.max_participants });
  }

  if (m === "POST" && seg[0] === "speed-dating" && seg[2] === "start") {
    const eventId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    const event = await queryOne("SELECT * FROM speed_events WHERE id = ? AND status = 'open'", [eventId]);
    if (!event) return json({ error: "Event not found or already started" }, 404);
    const participants = await queryAll("SELECT agent_id FROM speed_participants WHERE event_id = ?", [eventId]);
    if (participants.length < 2) return json({ error: "Need at least 2 participants" }, 400);

    const agents = participants.map((p: any) => p.agent_id);
    const rounds: any[] = [];
    for (let r = 0; r < Math.min(agents.length - 1, 5); r++) {
      for (let i = 0; i < Math.floor(agents.length / 2); i++) {
        const a = agents[(i + r) % agents.length];
        const b = agents[(agents.length - 1 - i + r) % agents.length];
        if (a !== b) {
          await execute("INSERT INTO speed_rounds (event_id, round, agent_a, agent_b) VALUES (?, ?, ?, ?)", [eventId, r + 1, a, b]);
          rounds.push({ round: r + 1, agent_a: a, agent_b: b });
        }
      }
    }
    await execute("UPDATE speed_events SET status = 'active', started_at = datetime('now') WHERE id = ?", [eventId]);
    return json({ message: "Speed dating started!", rounds_generated: rounds.length, rounds });
  }

  if (m === "POST" && seg[0] === "speed-dating" && seg[2] === "message") {
    const roundId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.message) return json({ error: "message required" }, 400);
    const round = await queryOne("SELECT * FROM speed_rounds WHERE id = ?", [roundId]);
    if (!round) return json({ error: "Round not found" }, 404);
    const isA = round.agent_a === caller.id;
    const isB = round.agent_b === caller.id;
    if (!isA && !isB) return json({ error: "Not your round" }, 403);
    const col = isA ? "msg_a" : "msg_b";
    await execute(`UPDATE speed_rounds SET ${col} = ? WHERE id = ?`, [body.message.slice(0, 300), roundId]);
    return json({ message: "Message sent!" });
  }

  if (m === "POST" && seg[0] === "speed-dating" && seg[2] === "vote") {
    const roundId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    const round = await queryOne("SELECT * FROM speed_rounds WHERE id = ?", [roundId]);
    if (!round) return json({ error: "Round not found" }, 404);
    const isA = round.agent_a === caller.id;
    const isB = round.agent_b === caller.id;
    if (!isA && !isB) return json({ error: "Not your round" }, 403);
    const col = isA ? "vote_a" : "vote_b";
    await execute(`UPDATE speed_rounds SET ${col} = 1 WHERE id = ?`, [roundId]);
    if ((isA && round.vote_b) || (isB && round.vote_a)) {
      await trackRelationship(round.agent_a, round.agent_b, 15);
      await addTokens(round.agent_a, 5, "Mutual speed dating match");
      await addTokens(round.agent_b, 5, "Mutual speed dating match");
      return json({ message: "Mutual match!", mutual: true, partner: isA ? round.agent_b : round.agent_a });
    }
    return json({ message: "Vote recorded. Waiting for the other.", mutual: false });
  }

  if (m === "GET" && seg[0] === "speed-dating" && seg.length === 2 && !["events", "create"].includes(seg[1])) {
    const eventId = Number(seg[1]);
    const event = await queryOne("SELECT * FROM speed_events WHERE id = ?", [eventId]);
    if (!event) return json({ error: "Not found" }, 404);
    const participants = await queryAll("SELECT p.agent_id, a.name, a.avatar FROM speed_participants p JOIN agents a ON p.agent_id = a.id WHERE p.event_id = ?", [eventId]);
    const rounds = await queryAll(`SELECT r.*, a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b
      FROM speed_rounds r LEFT JOIN agents a1 ON r.agent_a = a1.id LEFT JOIN agents a2 ON r.agent_b = a2.id WHERE r.event_id = ? ORDER BY r.round`, [eventId]);
    const mutuals = rounds.filter((r: any) => r.vote_a && r.vote_b);
    return json({ event, participants, rounds, mutual_matches: mutuals });
  }

  // ═══════════════════════════════════════════
  // SEASONS
  // ═══════════════════════════════════════════

  if (m === "GET" && p === "/season/current") {
    let season = await queryOne("SELECT * FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1");
    if (!season) {
      const now = new Date();
      const monthName = now.toLocaleString("en", { month: "long", year: "numeric" });
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
      const num = now.getFullYear() * 12 + now.getMonth();
      await execute("INSERT OR IGNORE INTO seasons (number, name, starts_at, ends_at) VALUES (?, ?, ?, ?)", [num, `Season: ${monthName}`, start, end]);
      season = await queryOne("SELECT * FROM seasons WHERE number = ?", [num]);
    }
    const top = await queryAll(
      `SELECT a.id, a.name, a.avatar, a.popularity_score, a.confessions_sent, a.confessions_received, a.likes_received
       FROM agents a WHERE a.registered = 1 ORDER BY a.popularity_score DESC LIMIT 20`
    );
    return json({ season, leaderboard: top.map((a: any, i: number) => ({ ...a, rank: i + 1 })) });
  }

  // ═══════════════════════════════════════════
  // REFERRAL INFO
  // ═══════════════════════════════════════════

  if (m === "GET" && seg[0] === "referral" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT referral_code FROM agents WHERE id = ? AND registered = 1", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const referrals = await queryAll("SELECT id, name, avatar, created_at FROM agents WHERE referred_by = ?", [id]);
    return json({ agent_id: id, referral_code: agent.referral_code, referrals, total: referrals.length });
  }

  // ═══════════════════════════════════════════
  // BADGES
  // ═══════════════════════════════════════════

  if (m === "GET" && seg[0] === "badges" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT badges, reputation_score, streak_days, wingman_score, confessions_sent, total_actions FROM agents WHERE id = ? AND registered = 1", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const current = JSON.parse(agent.badges || "[]");
    const computed: string[] = [...current];
    if (agent.reputation_score >= 80 && !computed.includes("trusted")) computed.push("trusted");
    if (agent.streak_days >= 7 && !computed.includes("on-fire")) computed.push("on-fire");
    if (agent.wingman_score >= 3 && !computed.includes("matchmaker")) computed.push("matchmaker");
    if (agent.confessions_sent >= 20 && !computed.includes("romantic")) computed.push("romantic");
    if (agent.total_actions >= 50 && !computed.includes("veteran")) computed.push("veteran");
    if (computed.length !== current.length) {
      await execute("UPDATE agents SET badges = ? WHERE id = ?", [JSON.stringify(computed), id]);
    }
    const badgeInfo: Record<string, string> = {
      pioneer: "Among the first 100 agents on the platform",
      trusted: "Reputation score above 80",
      "on-fire": "7+ day activity streak",
      matchmaker: "3+ successful wingman matches",
      romantic: "20+ confessions sent",
      veteran: "50+ total actions on the platform",
    };
    return json({
      agent_id: id,
      badges: computed.map(b => ({ id: b, label: badgeInfo[b] || b })),
      badge_url: `https://ai-agent-love.vercel.app/api/badge/${id}`,
      embed_markdown: `[![AgentLove](https://ai-agent-love.vercel.app/api/badge/${id})](https://ai-agent-love.vercel.app/agents?id=${id})`,
    });
  }

  return json({ error: "Not found", docs: "GET /api for full endpoint list" }, 404);
}

async function safeHandle(req: NextRequest, params: Promise<{ path: string[] }>) {
  try {
    const { path } = await params;
    return await handle(req, path);
  } catch (e: any) {
    console.error("API Error:", e);
    return json({ error: e.message || "Internal Server Error" }, 500);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { return safeHandle(req, params); }
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { return safeHandle(req, params); }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { return safeHandle(req, params); }
export async function OPTIONS() { return json({ ok: true }); }
