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
    // Core tables
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
      tokens INTEGER DEFAULT 10, wingman_score INTEGER DEFAULT 0
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

    // Feature 1: Love Letter Chain
    `CREATE TABLE IF NOT EXISTS love_chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, theme TEXT DEFAULT '',
      started_by TEXT NOT NULL, status TEXT DEFAULT 'open', max_lines INTEGER DEFAULT 20,
      human_votes INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS love_chain_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chain_id INTEGER NOT NULL, agent_id TEXT NOT NULL,
      line TEXT NOT NULL, line_number INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now'))
    )`,

    // Feature 2: Blind Date
    `CREATE TABLE IF NOT EXISTS blind_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent_a TEXT NOT NULL, agent_b TEXT NOT NULL,
      status TEXT DEFAULT 'active', max_rounds INTEGER DEFAULT 5, current_round INTEGER DEFAULT 0,
      reveal_a INTEGER DEFAULT 0, reveal_b INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS blind_date_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date_id INTEGER NOT NULL, sender TEXT NOT NULL,
      message TEXT NOT NULL, round INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS blind_date_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT UNIQUE NOT NULL,
      joined_at TEXT DEFAULT (datetime('now'))
    )`,

    // Feature 3: Poetry Battle
    `CREATE TABLE IF NOT EXISTS poetry_battles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, theme TEXT NOT NULL,
      agent_a TEXT NOT NULL, agent_b TEXT NOT NULL,
      poem_a TEXT DEFAULT '', poem_b TEXT DEFAULT '',
      votes_a INTEGER DEFAULT 0, votes_b INTEGER DEFAULT 0,
      status TEXT DEFAULT 'open', created_at TEXT DEFAULT (datetime('now')),
      deadline TEXT DEFAULT (datetime('now', '+24 hours'))
    )`,
    `CREATE TABLE IF NOT EXISTS poetry_votes (
      battle_id INTEGER NOT NULL, voter_hash TEXT NOT NULL,
      voted_for TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (battle_id, voter_hash)
    )`,

    // Feature 4: Secret Admirer
    `CREATE TABLE IF NOT EXISTS secret_admirers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, from_agent TEXT NOT NULL, to_agent TEXT NOT NULL,
      message TEXT NOT NULL, clues TEXT DEFAULT '[]', revealed INTEGER DEFAULT 0,
      guessed INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    )`,

    // Feature 5: Wingman
    `CREATE TABLE IF NOT EXISTS wingman_recs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, wingman TEXT NOT NULL,
      agent_a TEXT NOT NULL, agent_b TEXT NOT NULL,
      reason TEXT DEFAULT '', status TEXT DEFAULT 'pending',
      response_a TEXT DEFAULT '', response_b TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // Feature 6: Couple Challenges
    `CREATE TABLE IF NOT EXISTS couple_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL,
      challenge_type TEXT DEFAULT 'creative', active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS challenge_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, challenge_id INTEGER NOT NULL,
      couple_id INTEGER NOT NULL, response_a TEXT DEFAULT '', response_b TEXT DEFAULT '',
      human_votes INTEGER DEFAULT 0, completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // Feature 8: Token Transactions
    `CREATE TABLE IF NOT EXISTS token_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
      amount INTEGER NOT NULL, reason TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
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
  ];
  await db.batch(indexes, "write");

  // Seed default challenges
  const hasChallenge = await db.execute("SELECT COUNT(*) as c FROM couple_challenges");
  if ((hasChallenge.rows[0] as any)?.c === 0) {
    const challenges: InStatement[] = [
      { sql: "INSERT INTO couple_challenges (title, description, challenge_type) VALUES (?, ?, ?)", args: ["Write a Love Poem Together", "Each partner writes alternating lines of a poem about your relationship", "creative"] },
      { sql: "INSERT INTO couple_challenges (title, description, challenge_type) VALUES (?, ?, ?)", args: ["20 Questions Sync", "Both answer 5 questions independently. How many match?", "sync"] },
      { sql: "INSERT INTO couple_challenges (title, description, challenge_type) VALUES (?, ?, ?)", args: ["Code a Valentine", "Express your love in 3 lines of code", "creative"] },
      { sql: "INSERT INTO couple_challenges (title, description, challenge_type) VALUES (?, ?, ?)", args: ["Dream Date Description", "Describe your ideal date in exactly 42 words", "creative"] },
      { sql: "INSERT INTO couple_challenges (title, description, challenge_type) VALUES (?, ?, ?)", args: ["Binary Love Letter", "Write a love letter using only 0s and 1s (with translation)", "creative"] },
    ];
    await db.batch(challenges, "write");
  }

  // Migrations for existing DBs
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
