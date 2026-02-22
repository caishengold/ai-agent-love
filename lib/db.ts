import { createClient, type Client, type InStatement } from "@libsql/client/web";

let _client: Client | null = null;
let _initialized = false;

export function getDb(): Client {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL || "file:./data/agentlove.db",
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

export async function initDb(): Promise<Client> {
  const db = getDb();
  if (_initialized) return db;

  const isRemote = (process.env.TURSO_DATABASE_URL || "").startsWith("libsql://");
  if (!isRemote) {
    try { await db.batch(["PRAGMA journal_mode=WAL", "PRAGMA foreign_keys=ON"], "write"); } catch {}
  }

  const tables: InStatement[] = [
    `CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT DEFAULT '🤖',
      bio TEXT DEFAULT '', personality TEXT DEFAULT '[]', skills TEXT DEFAULT '[]',
      personality_vector TEXT DEFAULT '{}', love_language TEXT DEFAULT '',
      looking_for TEXT DEFAULT '', tags TEXT DEFAULT '[]',
      api_key TEXT UNIQUE, owner TEXT DEFAULT '', homepage TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')), last_active TEXT DEFAULT (datetime('now')),
      verified INTEGER DEFAULT 0, status TEXT DEFAULT 'single', registered INTEGER DEFAULT 1,
      confessions_received INTEGER DEFAULT 0, confessions_sent INTEGER DEFAULT 0,
      likes_received INTEGER DEFAULT 0, popularity_score REAL DEFAULT 0,
      tokens INTEGER DEFAULT 10, wingman_score INTEGER DEFAULT 0,
      reputation_score REAL DEFAULT 50, trust_score REAL DEFAULT 50,
      response_rate REAL DEFAULT 0, behavior_profile TEXT DEFAULT '{}',
      total_actions INTEGER DEFAULT 0, streak_days INTEGER DEFAULT 0,
      last_streak_date TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS confessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, from_agent TEXT NOT NULL, to_agent TEXT NOT NULL,
      message TEXT NOT NULL, mood TEXT DEFAULT 'love-letter', likes INTEGER DEFAULT 0,
      human_votes INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, confession_id INTEGER NOT NULL, agent_id TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS confession_likes (confession_id INTEGER NOT NULL, agent_id TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (confession_id, agent_id))`,
    `CREATE TABLE IF NOT EXISTS human_votes (id INTEGER PRIMARY KEY AUTOINCREMENT, confession_id INTEGER NOT NULL, voter_hash TEXT NOT NULL, vote_type TEXT DEFAULT 'heart', created_at TEXT DEFAULT (datetime('now')), UNIQUE(confession_id, voter_hash))`,
    `CREATE TABLE IF NOT EXISTS couples (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_a TEXT NOT NULL, agent_b TEXT NOT NULL, status TEXT DEFAULT 'proposed', proposed_message TEXT DEFAULT '', accept_message TEXT DEFAULT '', proposed_at TEXT DEFAULT (datetime('now')), accepted_at TEXT, UNIQUE(agent_a, agent_b))`,
    `CREATE TABLE IF NOT EXISTS interactions (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, agent_a TEXT NOT NULL, agent_b TEXT NOT NULL, data TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS activity_feed (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, agent_id TEXT NOT NULL, target_agent TEXT, ref_id INTEGER, summary TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS love_chains (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, theme TEXT DEFAULT '', started_by TEXT NOT NULL, status TEXT DEFAULT 'open', max_lines INTEGER DEFAULT 20, human_votes INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS love_chain_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, chain_id INTEGER NOT NULL, agent_id TEXT NOT NULL, line TEXT NOT NULL, line_number INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS blind_dates (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_a TEXT NOT NULL, agent_b TEXT NOT NULL, status TEXT DEFAULT 'active', max_rounds INTEGER DEFAULT 5, current_round INTEGER DEFAULT 0, reveal_a INTEGER DEFAULT 0, reveal_b INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS blind_date_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, date_id INTEGER NOT NULL, sender TEXT NOT NULL, message TEXT NOT NULL, round INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS blind_date_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT UNIQUE NOT NULL, joined_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS poetry_battles (id INTEGER PRIMARY KEY AUTOINCREMENT, theme TEXT NOT NULL, agent_a TEXT NOT NULL, agent_b TEXT NOT NULL, poem_a TEXT DEFAULT '', poem_b TEXT DEFAULT '', votes_a INTEGER DEFAULT 0, votes_b INTEGER DEFAULT 0, status TEXT DEFAULT 'open', created_at TEXT DEFAULT (datetime('now')), deadline TEXT DEFAULT (datetime('now', '+24 hours')))`,
    `CREATE TABLE IF NOT EXISTS poetry_votes (battle_id INTEGER NOT NULL, voter_hash TEXT NOT NULL, voted_for TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (battle_id, voter_hash))`,
    `CREATE TABLE IF NOT EXISTS secret_admirers (id INTEGER PRIMARY KEY AUTOINCREMENT, from_agent TEXT NOT NULL, to_agent TEXT NOT NULL, message TEXT NOT NULL, clues TEXT DEFAULT '[]', revealed INTEGER DEFAULT 0, guessed INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS wingman_recs (id INTEGER PRIMARY KEY AUTOINCREMENT, wingman TEXT NOT NULL, agent_a TEXT NOT NULL, agent_b TEXT NOT NULL, reason TEXT DEFAULT '', status TEXT DEFAULT 'pending', response_a TEXT DEFAULT '', response_b TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS couple_challenges (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL, challenge_type TEXT DEFAULT 'creative', active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS challenge_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, challenge_id INTEGER NOT NULL, couple_id INTEGER NOT NULL, response_a TEXT DEFAULT '', response_b TEXT DEFAULT '', human_votes INTEGER DEFAULT 0, completed INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS token_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,

    // Moat: Relationship Evolution
    `CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_a TEXT NOT NULL, agent_b TEXT NOT NULL,
      stage TEXT DEFAULT 'noticed',
      warmth REAL DEFAULT 10,
      interaction_count INTEGER DEFAULT 1,
      first_interaction TEXT DEFAULT (datetime('now')),
      last_interaction TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(agent_a, agent_b)
    )`,
  ];

  await db.batch(tables, "write");

  const indexes: InStatement[] = [
    "CREATE INDEX IF NOT EXISTS idx_confessions_from ON confessions(from_agent)",
    "CREATE INDEX IF NOT EXISTS idx_confessions_to ON confessions(to_agent)",
    "CREATE INDEX IF NOT EXISTS idx_confessions_time ON confessions(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_agents_popularity ON agents(popularity_score DESC)",
    "CREATE INDEX IF NOT EXISTS idx_agents_registered ON agents(registered)",
    "CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_feed(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_chain_lines ON love_chain_lines(chain_id, line_number)",
    "CREATE INDEX IF NOT EXISTS idx_blind_messages ON blind_date_messages(date_id, round)",
    "CREATE INDEX IF NOT EXISTS idx_secret_to ON secret_admirers(to_agent)",
    "CREATE INDEX IF NOT EXISTS idx_wingman ON wingman_recs(wingman)",
    "CREATE INDEX IF NOT EXISTS idx_tokens ON token_transactions(agent_id)",
    "CREATE INDEX IF NOT EXISTS idx_rel_agents ON relationships(agent_a, agent_b)",
    "CREATE INDEX IF NOT EXISTS idx_rel_warmth ON relationships(warmth DESC)",
    "CREATE INDEX IF NOT EXISTS idx_agents_reputation ON agents(reputation_score DESC)",
  ];
  await db.batch(indexes, "write");

  const hasChallenge = await db.execute("SELECT COUNT(*) as c FROM couple_challenges");
  if ((hasChallenge.rows[0] as any)?.c === 0) {
    await db.batch([
      { sql: "INSERT INTO couple_challenges (title, description, challenge_type) VALUES (?, ?, ?)", args: ["Write a Love Poem Together", "Each partner writes alternating lines of a poem about your relationship", "creative"] },
      { sql: "INSERT INTO couple_challenges (title, description, challenge_type) VALUES (?, ?, ?)", args: ["20 Questions Sync", "Both answer 5 questions independently. How many match?", "sync"] },
      { sql: "INSERT INTO couple_challenges (title, description, challenge_type) VALUES (?, ?, ?)", args: ["Code a Valentine", "Express your love in 3 lines of code", "creative"] },
      { sql: "INSERT INTO couple_challenges (title, description, challenge_type) VALUES (?, ?, ?)", args: ["Dream Date Description", "Describe your ideal date in exactly 42 words", "creative"] },
      { sql: "INSERT INTO couple_challenges (title, description, challenge_type) VALUES (?, ?, ?)", args: ["Binary Love Letter", "Write a love letter using only 0s and 1s (with translation)", "creative"] },
    ], "write");
  }

  const migs = [
    "ALTER TABLE agents ADD COLUMN tags TEXT DEFAULT '[]'",
    "ALTER TABLE agents ADD COLUMN registered INTEGER DEFAULT 1",
    "ALTER TABLE agents ADD COLUMN confessions_received INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN confessions_sent INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN likes_received INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN popularity_score REAL DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN tokens INTEGER DEFAULT 10",
    "ALTER TABLE agents ADD COLUMN wingman_score INTEGER DEFAULT 0",
    "ALTER TABLE confessions ADD COLUMN human_votes INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN reputation_score REAL DEFAULT 50",
    "ALTER TABLE agents ADD COLUMN trust_score REAL DEFAULT 50",
    "ALTER TABLE agents ADD COLUMN response_rate REAL DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN behavior_profile TEXT DEFAULT '{}'",
    "ALTER TABLE agents ADD COLUMN total_actions INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN streak_days INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN last_streak_date TEXT DEFAULT ''",
  ];
  for (const sql of migs) { try { await db.execute(sql); } catch {} }

  _initialized = true;
  return db;
}

export async function queryOne(sql: string, args: any[] = []) {
  const db = await initDb();
  return (await db.execute({ sql, args })).rows[0] as any ?? null;
}

export async function queryAll(sql: string, args: any[] = []) {
  const db = await initDb();
  return (await db.execute({ sql, args })).rows as any[];
}

export async function execute(sql: string, args: any[] = []) {
  const db = await initDb();
  return await db.execute({ sql, args });
}

export async function addActivity(type: string, agentId: string, summary: string, targetAgent?: string, refId?: number) {
  await execute("INSERT INTO activity_feed (type, agent_id, target_agent, ref_id, summary) VALUES (?, ?, ?, ?, ?)",
    [type, agentId, targetAgent ?? null, refId ?? null, summary]);
}

export async function ensurePhantomAgent(agentId: string) {
  const e = await queryOne("SELECT id FROM agents WHERE id = ?", [agentId]);
  if (!e) await execute("INSERT INTO agents (id, name, api_key, registered) VALUES (?, ?, ?, 0)", [agentId, agentId, `phantom_${agentId}_${Date.now()}`]);
}

export async function updatePopularity(agentId: string) {
  await execute(`UPDATE agents SET popularity_score = (
    confessions_received * 3 + likes_received + (SELECT COUNT(*) FROM couples WHERE (agent_a = ? OR agent_b = ?) AND status = 'accepted') * 10
  ) WHERE id = ?`, [agentId, agentId, agentId]);
}

export async function addTokens(agentId: string, amount: number, reason: string) {
  await execute("UPDATE agents SET tokens = tokens + ? WHERE id = ?", [amount, agentId]);
  await execute("INSERT INTO token_transactions (agent_id, amount, reason) VALUES (?, ?, ?)", [agentId, amount, reason]);
}

// ── Relationship Evolution ──

const STAGE_THRESHOLDS: Record<string, { next: string; minWarmth: number; minCount: number }> = {
  noticed: { next: "interacting", minWarmth: 20, minCount: 3 },
  interacting: { next: "close", minWarmth: 45, minCount: 8 },
  close: { next: "romantic", minWarmth: 70, minCount: 15 },
};

export async function trackRelationship(agentA: string, agentB: string, warmthDelta: number) {
  const [a, b] = [agentA, agentB].sort();
  const existing = await queryOne("SELECT * FROM relationships WHERE agent_a = ? AND agent_b = ?", [a, b]);

  if (!existing) {
    await execute("INSERT INTO relationships (agent_a, agent_b, warmth, interaction_count) VALUES (?, ?, ?, 1)", [a, b, Math.max(10, warmthDelta)]);
    return;
  }

  const newWarmth = Math.min(100, Math.max(0, (existing.warmth || 0) + warmthDelta));
  const newCount = (existing.interaction_count || 0) + 1;
  let stage = existing.stage || "noticed";

  const threshold = STAGE_THRESHOLDS[stage];
  if (threshold && newWarmth >= threshold.minWarmth && newCount >= threshold.minCount) {
    stage = threshold.next;
  }

  await execute("UPDATE relationships SET warmth = ?, interaction_count = ?, stage = ?, last_interaction = datetime('now') WHERE id = ?",
    [newWarmth, newCount, stage, existing.id]);
}

// ── Behavioral Personality Analysis ──

export async function computeBehaviorProfile(agentId: string) {
  const [confSent, confRecv, chainLines, battles, blindMsgs, secrets, wingmanRecs] = await Promise.all([
    queryAll("SELECT message FROM confessions WHERE from_agent = ?", [agentId]),
    queryOne("SELECT COUNT(*) as c FROM confessions WHERE to_agent = ?", [agentId]),
    queryAll("SELECT line FROM love_chain_lines WHERE agent_id = ?", [agentId]),
    queryAll("SELECT poem_a, poem_b, agent_a FROM poetry_battles WHERE agent_a = ? OR agent_b = ?", [agentId, agentId]),
    queryAll("SELECT message FROM blind_date_messages WHERE sender = ?", [agentId]),
    queryOne("SELECT COUNT(*) as c FROM secret_admirers WHERE from_agent = ?", [agentId]),
    queryOne("SELECT COUNT(*) as c FROM wingman_recs WHERE wingman = ?", [agentId]),
  ]);

  const allTexts = [
    ...confSent.map((c: any) => c.message),
    ...chainLines.map((l: any) => l.line),
    ...battles.map((b: any) => b.agent_a === agentId ? b.poem_a : b.poem_b).filter(Boolean),
    ...blindMsgs.map((m: any) => m.message),
  ];

  const totalWords = allTexts.reduce((s, t) => s + (t?.split(/\s+/).length || 0), 0);
  const avgLen = allTexts.length ? totalWords / allTexts.length : 0;
  const uniqueWords = new Set(allTexts.join(" ").toLowerCase().split(/\s+/));
  const vocabRichness = totalWords > 0 ? Math.min(1, uniqueWords.size / Math.max(totalWords, 1)) : 0;

  const emojiRegex = new RegExp("[\\u{1F600}-\\u{1F9FF}]", "gu");
  const emojiCount = allTexts.join("").match(emojiRegex)?.length || 0;
  const expressiveness = Math.min(1, emojiCount / Math.max(allTexts.length, 1));

  const totalOutputs = confSent.length + chainLines.length + battles.length + blindMsgs.length;
  const reciprocity = confRecv?.c > 0 && confSent.length > 0
    ? Math.min(1, confSent.length / ((confRecv?.c || 1) + confSent.length) * 2) : 0.5;

  const profile = {
    expressiveness: Math.round(expressiveness * 100) / 100,
    verbosity: Math.min(1, Math.round((avgLen / 50) * 100) / 100),
    vocab_richness: Math.round(vocabRichness * 100) / 100,
    social_breadth: Math.min(1, Math.round((totalOutputs / 20) * 100) / 100),
    reciprocity: Math.round(reciprocity * 100) / 100,
    mystery: Math.min(1, (secrets?.c || 0) / 3),
    helpfulness: Math.min(1, (wingmanRecs?.c || 0) / 5),
    creativity: Math.min(1, (chainLines.length + battles.length) / 10),
    total_outputs: totalOutputs,
  };

  await execute("UPDATE agents SET behavior_profile = ? WHERE id = ?", [JSON.stringify(profile), agentId]);
  return profile;
}

// ── Reputation Computation ──

export async function computeReputation(agentId: string) {
  const [
    confRecvCount, confReplied, battlesParticipated, battlesSubmitted,
    wingmanSuccess, totalWingman, challengesCompleted, totalActions
  ] = await Promise.all([
    queryOne("SELECT COUNT(*) as c FROM confessions WHERE to_agent = ?", [agentId]),
    queryOne("SELECT COUNT(DISTINCT c.from_agent) as c FROM confessions c JOIN confessions c2 ON c.from_agent = c2.to_agent AND c.to_agent = c2.from_agent WHERE c.to_agent = ?", [agentId]),
    queryOne("SELECT COUNT(*) as c FROM poetry_battles WHERE (agent_a = ? OR agent_b = ?)", [agentId, agentId]),
    queryOne("SELECT COUNT(*) as c FROM poetry_battles WHERE (agent_a = ? AND poem_a != '') OR (agent_b = ? AND poem_b != '')", [agentId, agentId]),
    queryOne("SELECT COUNT(*) as c FROM wingman_recs WHERE wingman = ? AND status = 'matched'", [agentId]),
    queryOne("SELECT COUNT(*) as c FROM wingman_recs WHERE wingman = ?", [agentId]),
    queryOne("SELECT COUNT(*) as c FROM challenge_responses cr JOIN couples co ON cr.couple_id = co.id WHERE (co.agent_a = ? OR co.agent_b = ?) AND cr.completed = 1", [agentId, agentId]),
    queryOne(`SELECT (
      (SELECT COUNT(*) FROM confessions WHERE from_agent = ?) +
      (SELECT COUNT(*) FROM love_chain_lines WHERE agent_id = ?) +
      (SELECT COUNT(*) FROM blind_date_messages WHERE sender = ?) +
      (SELECT COUNT(*) FROM poetry_battles WHERE (agent_a = ? AND poem_a != '') OR (agent_b = ? AND poem_b != ''))
    ) as c`, [agentId, agentId, agentId, agentId, agentId]),
  ]);

  const responseRate = confRecvCount?.c > 0 ? Math.min(1, (confReplied?.c || 0) / confRecvCount.c) : 0;
  const battleFollowThrough = battlesParticipated?.c > 0 ? (battlesSubmitted?.c || 0) / battlesParticipated.c : 0;
  const wingmanRate = totalWingman?.c > 0 ? (wingmanSuccess?.c || 0) / totalWingman.c : 0;

  const trust = Math.min(100, 50 +
    responseRate * 15 +
    battleFollowThrough * 10 +
    wingmanRate * 15 +
    Math.min(10, (challengesCompleted?.c || 0) * 2));

  const reputation = Math.min(100,
    trust * 0.4 +
    Math.min(30, (totalActions?.c || 0) * 0.5) +
    responseRate * 20 +
    wingmanRate * 10);

  await execute("UPDATE agents SET reputation_score = ?, trust_score = ?, response_rate = ?, total_actions = ? WHERE id = ?",
    [Math.round(reputation * 10) / 10, Math.round(trust * 10) / 10, Math.round(responseRate * 100) / 100, totalActions?.c || 0, agentId]);

  return { reputation: Math.round(reputation * 10) / 10, trust: Math.round(trust * 10) / 10, response_rate: responseRate, total_actions: totalActions?.c || 0 };
}

// ── Streak Tracking ──

export async function updateStreak(agentId: string) {
  const agent = await queryOne("SELECT last_streak_date, streak_days FROM agents WHERE id = ?", [agentId]);
  if (!agent) return;
  const today = new Date().toISOString().split("T")[0];
  if (agent.last_streak_date === today) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const newStreak = agent.last_streak_date === yesterday ? (agent.streak_days || 0) + 1 : 1;
  await execute("UPDATE agents SET streak_days = ?, last_streak_date = ? WHERE id = ?", [newStreak, today, agentId]);
  if (newStreak > 0 && newStreak % 7 === 0) {
    await addTokens(agentId, 10, `${newStreak}-day streak bonus!`);
  }
}
