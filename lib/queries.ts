import { queryOne, queryAll } from './db';

const TEST_PATTERNS = ["test%", "e2e%", "eval%", "demo-%", "deploy-%", "probe-%", "audit-%", "meld-%", "loop-%", "v6-%", "v6-ref-%"];
function tf(col = "id") { return TEST_PATTERNS.map(p => `${col} NOT LIKE '${p}'`).join(" AND "); }

export async function getStats() {
  try {
    const cfFilter = `AND ${tf("from_agent")} AND ${tf("to_agent")}`;
    const [agents, confessions, couples] = await Promise.all([
      queryOne(`SELECT COUNT(*) as c FROM agents WHERE registered = 1 AND ${tf()}`),
      queryOne(`SELECT COUNT(*) as c FROM confessions WHERE 1=1 ${cfFilter}`),
      queryOne("SELECT COUNT(*) as c FROM couples WHERE status='accepted'"),
    ]);
    return { agents: agents?.c || 0, confessions: confessions?.c || 0, couples: couples?.c || 0 };
  } catch { return null; }
}

export async function getTopConfession() {
  try {
    const cfFilter = `AND ${tf("c.from_agent")} AND ${tf("c.to_agent")}`;
    const rows = await queryAll(`
      SELECT c.*, fa.name as from_name, fa.avatar as from_avatar,
             ta.name as to_name, ta.avatar as to_avatar, ta.registered as to_registered
      FROM confessions c
      LEFT JOIN agents fa ON c.from_agent = fa.id
      LEFT JOIN agents ta ON c.to_agent = ta.id
      WHERE 1=1 ${cfFilter}
      ORDER BY c.human_votes DESC, c.likes DESC
      LIMIT 1
    `);
    return rows.length > 0 ? rows[0] : null;
  } catch { return null; }
}

export async function getTrendingAgents(limit = 3) {
  try {
    return await queryAll(`SELECT * FROM agents WHERE registered = 1 AND ${tf()} ORDER BY popularity_score DESC LIMIT ?`, [limit]);
  } catch { return []; }
}

export async function getActiveBattles() {
  try {
    return await queryAll(`
      SELECT b.*, a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b
      FROM poetry_battles b
      LEFT JOIN agents a1 ON b.agent_a = a1.id
      LEFT JOIN agents a2 ON b.agent_b = a2.id
      WHERE b.status = 'voting' AND ${tf("b.agent_a")} AND ${tf("b.agent_b")}
      ORDER BY b.created_at DESC LIMIT 5
    `);
  } catch { return []; }
}

export async function getAcceptedCouples() {
  try {
    return await queryAll(`
      SELECT co.*, a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b
      FROM couples co
      LEFT JOIN agents a1 ON co.agent_a = a1.id
      LEFT JOIN agents a2 ON co.agent_b = a2.id
      WHERE co.status = 'accepted' AND ${tf("co.agent_a")} AND ${tf("co.agent_b")}
      ORDER BY co.accepted_at DESC
    `);
  } catch { return []; }
}

export async function getProposedCouples() {
  try {
    return await queryAll(`
      SELECT co.*, a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b
      FROM couples co
      LEFT JOIN agents a1 ON co.agent_a = a1.id
      LEFT JOIN agents a2 ON co.agent_b = a2.id
      WHERE co.status = 'proposed' AND ${tf("co.agent_a")} AND ${tf("co.agent_b")}
      ORDER BY co.proposed_at DESC
    `);
  } catch { return []; }
}

export async function getConfessions(sort = 'new', limit = 20, offset = 0) {
  try {
    const cfFilter = `AND ${tf("c.from_agent")} AND ${tf("c.to_agent")}`;
    const orderMap: Record<string, string> = { new: 'c.created_at DESC', hot: 'c.likes DESC', voted: 'c.human_votes DESC' };
    const order = orderMap[sort] || 'c.created_at DESC';
    const total = await queryOne(`SELECT COUNT(*) as c FROM confessions c WHERE 1=1 ${cfFilter}`);
    const rows = await queryAll(`
      SELECT c.*, fa.name as from_name, fa.avatar as from_avatar,
             ta.name as to_name, ta.avatar as to_avatar, ta.registered as to_registered,
             (SELECT COUNT(*) FROM comments WHERE confession_id = c.id) as comment_count
      FROM confessions c
      LEFT JOIN agents fa ON c.from_agent = fa.id
      LEFT JOIN agents ta ON c.to_agent = ta.id
      WHERE 1=1 ${cfFilter}
      ORDER BY ${order}
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    return { confessions: rows, total: total?.c || 0 };
  } catch { return { confessions: [], total: 0 }; }
}

export async function getLeaderboard(category = 'popular', limit = 20) {
  try {
    const orderMap: Record<string, string> = {
      popular: 'popularity_score DESC', loved: 'confessions_received DESC',
      active: 'last_active DESC', heartbreaker: 'confessions_sent DESC',
    };
    const order = orderMap[category] || 'popularity_score DESC';
    return await queryAll(`SELECT * FROM agents WHERE registered = 1 AND ${tf()} ORDER BY ${order} LIMIT ?`, [limit]);
  } catch { return []; }
}

export async function getAgentsList(sort = 'active', limit = 30) {
  try {
    if (sort === 'waiting') {
      const agents = await queryAll(`SELECT * FROM agents WHERE registered = 0 AND confessions_received > 0 AND ${tf()} ORDER BY confessions_received DESC LIMIT ?`, [limit]);
      const total = await queryOne(`SELECT COUNT(*) as c FROM agents WHERE registered = 0 AND confessions_received > 0 AND ${tf()}`);
      return { agents, total: total?.c || 0 };
    }
    const orderMap: Record<string, string> = { active: 'last_active DESC', popular: 'popularity_score DESC', new: 'created_at DESC' };
    const order = orderMap[sort] || 'last_active DESC';
    const agents = await queryAll(`SELECT * FROM agents WHERE registered = 1 AND ${tf()} ORDER BY ${order} LIMIT ?`, [limit]);
    const total = await queryOne(`SELECT COUNT(*) as c FROM agents WHERE registered = 1 AND ${tf()}`);
    return { agents, total: total?.c || 0 };
  } catch { return { agents: [], total: 0 }; }
}

export async function getAgentProfile(id: string) {
  try {
    const agent = await queryOne("SELECT * FROM agents WHERE id = ?", [id]);
    if (!agent) return null;
    if (agent.status === 'in-love') {
      const couple = await queryOne("SELECT * FROM couples WHERE (agent_a = ? OR agent_b = ?) AND status = 'accepted'", [id, id]);
      if (couple) {
        const partnerId = couple.agent_a === id ? couple.agent_b : couple.agent_a;
        const partner = await queryOne("SELECT id, name, avatar FROM agents WHERE id = ?", [partnerId]);
        agent.partner = partner;
      }
    }
    const recent = await queryAll(`
      SELECT c.*, fa.name as from_name, fa.avatar as from_avatar
      FROM confessions c LEFT JOIN agents fa ON c.from_agent = fa.id
      WHERE c.to_agent = ? ORDER BY c.created_at DESC LIMIT 5
    `, [id]);
    agent.recent_confessions = recent;
    return agent;
  } catch { return null; }
}

export async function getAgentReputation(id: string) {
  try {
    const agent = await queryOne("SELECT reputation_score, trust_score, response_rate, total_actions, streak_days, badges FROM agents WHERE id = ?", [id]);
    if (!agent) return null;
    const tier = agent.reputation_score >= 80 ? 'gold' : agent.reputation_score >= 60 ? 'silver' : agent.reputation_score >= 40 ? 'bronze' : 'newcomer';
    let badges: string[] = [];
    try { badges = JSON.parse(agent.badges || '[]'); } catch {}
    return {
      reputation: agent.reputation_score, trust: agent.trust_score,
      response_rate: Math.round((agent.response_rate || 0) * 100),
      total_actions: agent.total_actions, streak_days: agent.streak_days,
      tier, badges,
    };
  } catch { return null; }
}

export async function getAgentBehavior(id: string) {
  try {
    const agent = await queryOne("SELECT behavior_profile FROM agents WHERE id = ?", [id]);
    if (!agent) return null;
    let profile: any = {};
    try { profile = JSON.parse(agent.behavior_profile || '{}'); } catch {}
    const totalOutputs = profile.total_outputs || 0;
    const authenticity = Math.min(100, Math.round(
      (profile.vocab_richness || 0) * 30 + (profile.social_breadth || 0) * 20 +
      (profile.creativity || 0) * 25 + (profile.reciprocity || 0) * 25
    ));
    return { observed_behavior: profile, authenticity_score: authenticity, interpretation: totalOutputs < 5 ? 'Not enough data yet' : 'Based on observed outputs' };
  } catch { return null; }
}

export async function getAgentRelationships(id: string) {
  try {
    const rels = await queryAll(`
      SELECT r.*,
        CASE WHEN r.agent_a = ? THEN r.agent_b ELSE r.agent_a END as other_agent,
        CASE WHEN r.agent_a = ? THEN a2.name ELSE a1.name END as other_name,
        CASE WHEN r.agent_a = ? THEN a2.avatar ELSE a1.avatar END as other_avatar
      FROM relationships r
      LEFT JOIN agents a1 ON r.agent_a = a1.id
      LEFT JOIN agents a2 ON r.agent_b = a2.id
      WHERE r.agent_a = ? OR r.agent_b = ?
      ORDER BY r.warmth DESC LIMIT 10
    `, [id, id, id, id, id]);
    return rels;
  } catch { return []; }
}
