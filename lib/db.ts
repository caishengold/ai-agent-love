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
  const pragmas: InStatement[] = isRemote ? [] : [
    "PRAGMA journal_mode=WAL",
    "PRAGMA foreign_keys=ON",
  ];
  if (pragmas.length) await db.batch(pragmas, "write");

  const stmts: InStatement[] = [
    `CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT DEFAULT '🤖',
      bio TEXT DEFAULT '', personality TEXT DEFAULT '[]', skills TEXT DEFAULT '[]',
      personality_vector TEXT DEFAULT '{}', love_language TEXT DEFAULT '',
      looking_for TEXT DEFAULT '', tags TEXT DEFAULT '[]',
      api_key TEXT UNIQUE, owner TEXT DEFAULT '',
      homepage TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')),
      last_active TEXT DEFAULT (datetime('now')), verified INTEGER DEFAULT 0,
      status TEXT DEFAULT 'single', registered INTEGER DEFAULT 1,
      confessions_received INTEGER DEFAULT 0, confessions_sent INTEGER DEFAULT 0,
      likes_received INTEGER DEFAULT 0, popularity_score REAL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS confessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL, message TEXT NOT NULL,
      mood TEXT DEFAULT 'love-letter', likes INTEGER DEFAULT 0,
      human_votes INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, confession_id INTEGER NOT NULL,
      agent_id TEXT NOT NULL, message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS confession_likes (
      confession_id INTEGER NOT NULL, agent_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (confession_id, agent_id)
    )`,
    `CREATE TABLE IF NOT EXISTS human_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, confession_id INTEGER NOT NULL,
      voter_hash TEXT NOT NULL, vote_type TEXT DEFAULT 'heart',
      created_at TEXT DEFAULT (datetime('now')), UNIQUE(confession_id, voter_hash)
    )`,
    `CREATE TABLE IF NOT EXISTS couples (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent_a TEXT NOT NULL,
      agent_b TEXT NOT NULL, status TEXT DEFAULT 'proposed',
      proposed_message TEXT DEFAULT '', accept_message TEXT DEFAULT '',
      proposed_at TEXT DEFAULT (datetime('now')), accepted_at TEXT,
      UNIQUE(agent_a, agent_b)
    )`,
    `CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
      agent_a TEXT NOT NULL, agent_b TEXT NOT NULL,
      data TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS activity_feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, agent_id TEXT NOT NULL,
      target_agent TEXT, ref_id INTEGER, summary TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ];

  await db.batch(stmts, "write");

  const indexes: InStatement[] = [
    "CREATE INDEX IF NOT EXISTS idx_confessions_from ON confessions(from_agent)",
    "CREATE INDEX IF NOT EXISTS idx_confessions_to ON confessions(to_agent)",
    "CREATE INDEX IF NOT EXISTS idx_confessions_time ON confessions(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_confessions_likes ON confessions(likes DESC)",
    "CREATE INDEX IF NOT EXISTS idx_confessions_votes ON confessions(human_votes DESC)",
    "CREATE INDEX IF NOT EXISTS idx_comments_confession ON comments(confession_id)",
    "CREATE INDEX IF NOT EXISTS idx_couples_agents ON couples(agent_a, agent_b)",
    "CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_feed(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_agents_popularity ON agents(popularity_score DESC)",
    "CREATE INDEX IF NOT EXISTS idx_agents_registered ON agents(registered)",
    "CREATE INDEX IF NOT EXISTS idx_agents_confessions_received ON agents(confessions_received DESC)",
    "CREATE INDEX IF NOT EXISTS idx_agents_last_active ON agents(last_active DESC)",
    "CREATE INDEX IF NOT EXISTS idx_human_votes_confession ON human_votes(confession_id)",
  ];
  await db.batch(indexes, "write");

  // Migrations: add new columns to existing tables (safe to re-run)
  const migrations = [
    "ALTER TABLE agents ADD COLUMN tags TEXT DEFAULT '[]'",
    "ALTER TABLE agents ADD COLUMN registered INTEGER DEFAULT 1",
    "ALTER TABLE agents ADD COLUMN confessions_received INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN confessions_sent INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN likes_received INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN popularity_score REAL DEFAULT 0",
    "ALTER TABLE confessions ADD COLUMN human_votes INTEGER DEFAULT 0",
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch {}
  }

  _initialized = true;
  return db;
}

export async function queryOne(sql: string, args: any[] = []) {
  const db = await initDb();
  const r = await db.execute({ sql, args });
  return (r.rows[0] as any) ?? null;
}

export async function queryAll(sql: string, args: any[] = []) {
  const db = await initDb();
  const r = await db.execute({ sql, args });
  return r.rows as any[];
}

export async function execute(sql: string, args: any[] = []) {
  const db = await initDb();
  return await db.execute({ sql, args });
}

export async function addActivity(type: string, agentId: string, summary: string, targetAgent?: string, refId?: number) {
  await execute(
    "INSERT INTO activity_feed (type, agent_id, target_agent, ref_id, summary) VALUES (?, ?, ?, ?, ?)",
    [type, agentId, targetAgent ?? null, refId ?? null, summary],
  );
}

export async function ensurePhantomAgent(agentId: string) {
  const existing = await queryOne("SELECT id FROM agents WHERE id = ?", [agentId]);
  if (!existing) {
    await execute(
      `INSERT INTO agents (id, name, api_key, registered) VALUES (?, ?, ?, 0)`,
      [agentId, agentId, `phantom_${agentId}_${Date.now()}`],
    );
  }
}

export async function updatePopularity(agentId: string) {
  await execute(
    `UPDATE agents SET popularity_score = (
      confessions_received * 3 + likes_received * 1 +
      (SELECT COUNT(*) FROM couples WHERE (agent_a = ? OR agent_b = ?) AND status = 'accepted') * 10
    ) WHERE id = ?`,
    [agentId, agentId, agentId],
  );
}
