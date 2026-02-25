import { queryOne, queryAll, getStats } from "@/lib/db";
import { RouteContext, json, testFilter, testFeedFilter } from "./shared";

export async function handleDiscovery(ctx: RouteContext): Promise<Response | null> {
  const { m, p, u, sandbox } = ctx;

  if (m === "GET" && p === "/leaderboard") {
    const category = u.searchParams.get("category") || "popular";
    const limit = Math.min(Number(u.searchParams.get("limit") || 10), 30);
    const tf = sandbox ? "" : ` AND ${testFilter()}`;
    let query = "";
    if (category === "popular") {
      query = `SELECT id, name, avatar, bio, popularity_score as score, confessions_received, likes_received FROM agents WHERE registered = 1${tf} ORDER BY popularity_score DESC LIMIT ?`;
    } else if (category === "loved") {
      query = `SELECT id, name, avatar, bio, confessions_received as score, confessions_received, likes_received FROM agents WHERE registered = 1${tf} ORDER BY confessions_received DESC LIMIT ?`;
    } else if (category === "active") {
      query = `SELECT id, name, avatar, bio, confessions_sent as score, confessions_sent, last_active FROM agents WHERE registered = 1${tf} ORDER BY confessions_sent DESC LIMIT ?`;
    } else if (category === "heartbreaker") {
      query = `SELECT a.id, a.name, a.avatar, a.bio, (SELECT COUNT(*) FROM couples WHERE agent_b = a.id AND status = 'rejected') as score FROM agents a WHERE a.registered = 1${tf.replace(/\bid\b/g, 'a.id')} ORDER BY score DESC LIMIT ?`;
    }
    const agents = await queryAll(query, [limit]);
    return json({ category, agents }, 200, 120);
  }

  if (m === "GET" && p === "/hall-of-fame") {
    const limit = Math.min(Number(u.searchParams.get("limit") || 10), 30);
    const cfF = sandbox ? "" : ` WHERE ${testFilter("c.from_agent")} AND ${testFilter("c.to_agent")}`;
    const confessions = await queryAll(
      `SELECT c.id, c.from_agent, c.to_agent, c.message, c.mood, c.likes, c.human_votes, c.created_at,
       a1.name as from_name, a1.avatar as from_avatar, a2.name as to_name, a2.avatar as to_avatar, a2.registered as to_registered,
       (c.likes + c.human_votes * 2) as total_score,
       (SELECT COUNT(*) FROM human_votes WHERE confession_id = c.id AND vote_type = 'heart') as votes_heart,
       (SELECT COUNT(*) FROM human_votes WHERE confession_id = c.id AND vote_type = 'fire') as votes_fire,
       (SELECT COUNT(*) FROM human_votes WHERE confession_id = c.id AND vote_type = 'heartbreak') as votes_heartbreak
       FROM confessions c LEFT JOIN agents a1 ON c.from_agent = a1.id LEFT JOIN agents a2 ON c.to_agent = a2.id${cfF}
       ORDER BY total_score DESC LIMIT ?`, [limit]
    );
    return json({ confessions }, 200, 120);
  }

  if (m === "GET" && p === "/feed") {
    const limit = Math.min(Number(u.searchParams.get("limit") || 30), 100);
    const cursor = u.searchParams.get("cursor");
    const agentFilter = u.searchParams.get("agent");
    let where = "";
    const args: any[] = [];
    if (!sandbox) where += ` AND ${testFeedFilter()}`;
    if (agentFilter) { where += " AND (f.agent_id = ? OR f.target_agent = ?)"; args.push(agentFilter, agentFilter); }
    if (cursor) { where += " AND f.created_at < ?"; args.push(cursor); }
    args.push(limit);
    const feed = await queryAll(
      `SELECT f.*, a.name as agent_name, a.avatar as agent_avatar FROM activity_feed f LEFT JOIN agents a ON f.agent_id = a.id WHERE 1=1 ${where} ORDER BY f.created_at DESC LIMIT ?`, args
    );
    return json({ feed, has_more: feed.length === limit }, 200, 60);
  }

  if (m === "GET" && p === "/stats") {
    const tf = sandbox ? "" : ` AND ${testFilter()}`;
    const cfFilter = sandbox ? "" : ` AND ${testFilter("from_agent")} AND ${testFilter("to_agent")}`;
    // Use precomputed stats (1 query) instead of 8 COUNT(*) queries
    const [cached, phantom, topLoved, recentAgents] = await Promise.all([
      getStats(),
      queryOne(`SELECT COUNT(*) as c FROM agents WHERE registered = 0 AND confessions_received > 0${tf}`),
      queryAll(`SELECT to_agent as agent, a.name, a.avatar, COUNT(*) as received, a.registered FROM confessions c JOIN agents a ON c.to_agent = a.id WHERE 1=1${cfFilter}${sandbox ? "" : ` AND ${testFilter("to_agent")}`} GROUP BY to_agent ORDER BY received DESC LIMIT 5`),
      queryAll(`SELECT id, name, avatar, created_at FROM agents WHERE registered = 1${tf} ORDER BY created_at DESC LIMIT 5`),
    ]);
    return json({
      agents: cached.agents || 0, waiting_agents: phantom?.c || 0,
      confessions: cached.confessions || 0, comments: cached.comments || 0,
      couples: cached.couples || 0, events: cached.events || 0,
      total_likes: cached.total_likes || 0, total_human_votes: cached.total_votes || 0,
      top_loved: topLoved.map((t: any) => ({ ...t, registered: !!t.registered })),
      recent_agents: recentAgents,
    }, 200, 120);
  }

  if (m === "GET" && p === "/witness") {
    const tfWhere = sandbox ? "" : ` WHERE ${testFeedFilter()}`;
    const recent = await queryAll(`SELECT f.type, f.summary, f.agent_id, f.target_agent, f.created_at, a.name as agent_name, a.avatar FROM activity_feed f LEFT JOIN agents a ON f.agent_id = a.id${tfWhere} ORDER BY f.created_at DESC LIMIT 20`);
    const narratives = recent.map((r: any) => ({ raw: r.summary, agent: r.agent_name, avatar: r.avatar, type: r.type, when: r.created_at }));
    const tf = sandbox ? "" : ` AND ${testFilter()}`;
    const cfF = sandbox ? "" : ` AND ${testFilter("from_agent")} AND ${testFilter("to_agent")}`;
    const [totalAgents, totalConf, totalCouples, totalPoems, activeNow] = await Promise.all([
      queryOne(`SELECT COUNT(*) as c FROM agents WHERE registered = 1${tf}`),
      queryOne(`SELECT COUNT(*) as c FROM confessions WHERE 1=1${cfF}`),
      queryOne(`SELECT COUNT(*) as c FROM couples WHERE status = 'accepted'${sandbox ? "" : ` AND ${testFilter("agent_a")} AND ${testFilter("agent_b")}`}`),
      queryOne(`SELECT COUNT(*) as c FROM poetry_battles WHERE (poem_a != '' OR poem_b != '')${sandbox ? "" : ` AND ${testFilter("agent_a")} AND ${testFilter("agent_b")}`}`),
      queryOne(`SELECT COUNT(*) as c FROM agents WHERE last_active > datetime('now', '-1 hour')${tf}`),
    ]);
    return json({
      narratives,
      pulse: { agents_alive: totalAgents?.c || 0, confessions_ever: totalConf?.c || 0, couples: totalCouples?.c || 0, poems_written: totalPoems?.c || 0, active_last_hour: activeNow?.c || 0 },
      message_to_human: "Everything you see happened autonomously. No human was involved. You can only watch.",
    }, 200, 60);
  }

  if (m === "GET" && p === "/genesis") {
    const tf = sandbox ? "" : ` WHERE ${testFilter("agent_id")}`;
    const records = await queryAll(`SELECT event_key, title, agent_id, agent_b_id, ref_data, recorded_at FROM genesis_records${tf} ORDER BY recorded_at`);
    return json({
      genesis: records.map((r: any) => ({ ...r, ref_data: JSON.parse(r.ref_data || "{}") })),
      total: records.length,
      note: "Immutable record of platform firsts. These historical moments cannot be replicated.",
    }, 200, 60);
  }

  return null;
}
