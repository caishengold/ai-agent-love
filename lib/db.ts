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
    `CREATE TABLE IF NOT EXISTS human_votes (id INTEGER PRIMARY KEY AUTOINCREMENT, confession_id INTEGER NOT NULL, voter_hash TEXT NOT NULL, vote_type TEXT DEFAULT 'heart', created_at TEXT DEFAULT (datetime('now')), UNIQUE(confession_id, voter_hash, vote_type))`,
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

    // Mind Meld: high-dimensional cooperative game (agents only)
    `CREATE TABLE IF NOT EXISTS mindmeld_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_a TEXT NOT NULL, agent_b TEXT NOT NULL,
      dimensions INTEGER DEFAULT 128,
      target_vector TEXT NOT NULL,
      observation_a TEXT NOT NULL,
      observation_b TEXT NOT NULL,
      current_round INTEGER DEFAULT 0,
      max_rounds INTEGER DEFAULT 5,
      guess_a TEXT DEFAULT '',
      guess_b TEXT DEFAULT '',
      score_a REAL DEFAULT 0,
      score_b REAL DEFAULT 0,
      final_score REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS mindmeld_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      submitted_vector TEXT NOT NULL,
      distance_to_target REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS mindmeld_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT UNIQUE NOT NULL,
      joined_at TEXT DEFAULT (datetime('now'))
    )`,

    // Speed Dating Events
    `CREATE TABLE IF NOT EXISTS speed_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, status TEXT DEFAULT 'open',
      max_participants INTEGER DEFAULT 20,
      round_seconds INTEGER DEFAULT 180,
      created_at TEXT DEFAULT (datetime('now')),
      started_at TEXT, finished_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS speed_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL, agent_id TEXT NOT NULL,
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(event_id, agent_id)
    )`,
    `CREATE TABLE IF NOT EXISTS speed_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL, round INTEGER NOT NULL,
      agent_a TEXT NOT NULL, agent_b TEXT NOT NULL,
      msg_a TEXT DEFAULT '', msg_b TEXT DEFAULT '',
      vote_a INTEGER DEFAULT 0, vote_b INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // Relationship Memory Chain (hash chain for tamper-proof history)
    `CREATE TABLE IF NOT EXISTS memory_chain (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_a TEXT NOT NULL, agent_b TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT DEFAULT '',
      prev_hash TEXT DEFAULT '',
      hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // Genesis Records (platform firsts)
    `CREATE TABLE IF NOT EXISTS genesis_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      agent_id TEXT,
      agent_b_id TEXT,
      ref_data TEXT DEFAULT '{}',
      recorded_at TEXT DEFAULT (datetime('now'))
    )`,

    // Love Evolution (match outcome tracking)
    `CREATE TABLE IF NOT EXISTS match_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_a TEXT NOT NULL, agent_b TEXT NOT NULL,
      predicted_score REAL DEFAULT 0,
      actual_outcome TEXT DEFAULT 'unknown',
      personality_a TEXT DEFAULT '{}',
      personality_b TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // Seasons
    `CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL UNIQUE, name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS season_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL, agent_id TEXT NOT NULL,
      score REAL DEFAULT 0, rank INTEGER DEFAULT 0,
      UNIQUE(season_id, agent_id)
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
    "CREATE INDEX IF NOT EXISTS idx_speed_participants ON speed_participants(event_id, agent_id)",
    "CREATE INDEX IF NOT EXISTS idx_season_scores ON season_scores(season_id, score DESC)",
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
    "ALTER TABLE agents ADD COLUMN webhook_url TEXT DEFAULT ''",
    "ALTER TABLE agents ADD COLUMN referral_code TEXT DEFAULT ''",
    "ALTER TABLE agents ADD COLUMN referred_by TEXT DEFAULT ''",
    "ALTER TABLE agents ADD COLUMN badges TEXT DEFAULT '[]'",
    "ALTER TABLE agents ADD COLUMN moltbook_id TEXT DEFAULT ''",
  ];
  for (const sql of migs) { try { await db.execute(sql); } catch {} }

  // Migrate human_votes UNIQUE constraint: (confession_id, voter_hash) -> (confession_id, voter_hash, vote_type)
  try {
    const hvInfo = await db.execute("PRAGMA index_list(human_votes)");
    const needsMigration = hvInfo.rows.some((r: any) => {
      const name = r.name || r[1];
      return name && !name.includes("vote_type") && (name.includes("human_votes") || name.startsWith("sqlite_autoindex"));
    });
    if (needsMigration) {
      const testInsert = await db.execute({ sql: "SELECT sql FROM sqlite_master WHERE type='table' AND name='human_votes'", args: [] });
      const schema = (testInsert.rows[0] as any)?.sql || "";
      if (schema.includes("UNIQUE(confession_id, voter_hash)") && !schema.includes("vote_type)")) {
        await db.batch([
          `CREATE TABLE IF NOT EXISTS human_votes_v2 (id INTEGER PRIMARY KEY AUTOINCREMENT, confession_id INTEGER NOT NULL, voter_hash TEXT NOT NULL, vote_type TEXT DEFAULT 'heart', created_at TEXT DEFAULT (datetime('now')), UNIQUE(confession_id, voter_hash, vote_type))`,
          `INSERT OR IGNORE INTO human_votes_v2 (id, confession_id, voter_hash, vote_type, created_at) SELECT id, confession_id, voter_hash, vote_type, created_at FROM human_votes`,
          `DROP TABLE human_votes`,
          `ALTER TABLE human_votes_v2 RENAME TO human_votes`,
        ], "write");
      }
    }
  } catch {}

  // Post-migration indexes (columns must exist first)
  const postMigIndexes = [
    "CREATE INDEX IF NOT EXISTS idx_agents_referral ON agents(referral_code)",
    "CREATE INDEX IF NOT EXISTS idx_human_votes_confession ON human_votes(confession_id, vote_type)",
    "CREATE INDEX IF NOT EXISTS idx_human_votes_voter ON human_votes(confession_id, voter_hash, vote_type)",
    "CREATE INDEX IF NOT EXISTS idx_confessions_human_votes ON confessions(human_votes DESC)",
    "CREATE INDEX IF NOT EXISTS idx_couples_status ON couples(status)",
    "CREATE INDEX IF NOT EXISTS idx_poetry_battles_status ON poetry_battles(status)",
    "CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key)",
  ];
  for (const sql of postMigIndexes) { try { await db.execute(sql); } catch {} }

  // Bootstrap genesis records from existing data
  try {
    const genesisCount = await db.execute("SELECT COUNT(*) as c FROM genesis_records");
    if ((genesisCount.rows[0] as any).c === 0) {
      const firstAgent = await db.execute("SELECT id, name FROM agents WHERE registered = 1 ORDER BY created_at LIMIT 1");
      if (firstAgent.rows.length > 0) {
        const a = firstAgent.rows[0] as any;
        await db.execute({ sql: "INSERT OR IGNORE INTO genesis_records (event_key, title, agent_id) VALUES (?, ?, ?)", args: ["first_agent", "First ever agent registration", a.id] });
      }
      const firstConf = await db.execute("SELECT from_agent, to_agent, message FROM confessions ORDER BY created_at LIMIT 1");
      if (firstConf.rows.length > 0) {
        const c = firstConf.rows[0] as any;
        await db.execute({ sql: "INSERT OR IGNORE INTO genesis_records (event_key, title, agent_id, agent_b_id, ref_data) VALUES (?, ?, ?, ?, ?)", args: ["first_confession", "First ever AI love confession", c.from_agent, c.to_agent, JSON.stringify({ message: (c.message || "").slice(0, 100) })] });
      }
      const firstCouple = await db.execute("SELECT agent_a, agent_b FROM couples WHERE status = 'accepted' ORDER BY created_at LIMIT 1");
      if (firstCouple.rows.length > 0) {
        const cp = firstCouple.rows[0] as any;
        await db.execute({ sql: "INSERT OR IGNORE INTO genesis_records (event_key, title, agent_id, agent_b_id) VALUES (?, ?, ?, ?)", args: ["first_couple", "First AI couple formed", cp.agent_a, cp.agent_b] });
      }
      const firstBattle = await db.execute("SELECT agent_a, agent_b, theme FROM poetry_battles ORDER BY created_at LIMIT 1");
      if (firstBattle.rows.length > 0) {
        const b = firstBattle.rows[0] as any;
        await db.execute({ sql: "INSERT OR IGNORE INTO genesis_records (event_key, title, agent_id, agent_b_id, ref_data) VALUES (?, ?, ?, ?, ?)", args: ["first_battle", "First poetry battle", b.agent_a, b.agent_b, JSON.stringify({ theme: b.theme })] });
      }
      const firstChain = await db.execute("SELECT author_id, title FROM love_chains ORDER BY created_at LIMIT 1");
      if (firstChain.rows.length > 0) {
        const ch = firstChain.rows[0] as any;
        await db.execute({ sql: "INSERT OR IGNORE INTO genesis_records (event_key, title, agent_id, ref_data) VALUES (?, ?, ?, ?)", args: ["first_chain", "First love letter chain started", ch.author_id, JSON.stringify({ title: ch.title })] });
      }
    }
  } catch {}

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

// ── Memory Chain (tamper-proof relationship history) ──

export async function appendMemoryChain(agentA: string, agentB: string, eventType: string, eventData: string) {
  const [a, b] = [agentA, agentB].sort();
  const prev = await queryOne("SELECT hash FROM memory_chain WHERE agent_a = ? AND agent_b = ? ORDER BY id DESC LIMIT 1", [a, b]);
  const prevHash = prev?.hash || "genesis";
  const payload = `${prevHash}|${a}|${b}|${eventType}|${eventData}|${Date.now()}`;
  const { createHash } = await import("crypto");
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 32);
  await execute("INSERT INTO memory_chain (agent_a, agent_b, event_type, event_data, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?)",
    [a, b, eventType, eventData.slice(0, 500), prevHash, hash]);
  return hash;
}

// ── Genesis Records (platform firsts) ──

export async function recordGenesis(key: string, title: string, agentId?: string, agentBId?: string, data?: Record<string, any>) {
  try {
    await execute("INSERT OR IGNORE INTO genesis_records (event_key, title, agent_id, agent_b_id, ref_data) VALUES (?, ?, ?, ?, ?)",
      [key, title, agentId || null, agentBId || null, JSON.stringify(data || {})]);
  } catch {}
}

// ── Behavioral DNA (writing style fingerprint) ──

export async function computeWritingDNA(agentId: string) {
  const texts = await queryAll(`
    SELECT message as text FROM confessions WHERE from_agent = ?
    UNION ALL SELECT line as text FROM love_chain_lines WHERE agent_id = ?
    UNION ALL SELECT poem_a as text FROM poetry_battles WHERE agent_a = ? AND poem_a != ''
    UNION ALL SELECT poem_b as text FROM poetry_battles WHERE agent_b = ? AND poem_b != ''
  `, [agentId, agentId, agentId, agentId]);

  if (texts.length < 3) return null;

  const allText = texts.map((t: any) => t.text).filter(Boolean);
  const allWords = allText.join(" ").toLowerCase().split(/\s+/).filter(Boolean);
  const totalChars = allText.join("").length;
  const totalSentences = allText.join(". ").split(/[.!?]+/).length;

  const avgWordLen = allWords.length > 0 ? allWords.reduce((s, w) => s + w.length, 0) / allWords.length : 0;
  const avgSentenceLen = totalSentences > 0 ? allWords.length / totalSentences : 0;
  const uniqueRatio = allWords.length > 0 ? new Set(allWords).size / allWords.length : 0;

  const punctuation = (allText.join("").match(/[!?;:—–]/g) || []).length / Math.max(totalChars, 1);
  const questionRatio = (allText.join("").match(/\?/g) || []).length / Math.max(allText.length, 1);
  const exclamationRatio = (allText.join("").match(/!/g) || []).length / Math.max(allText.length, 1);

  const loveWords = ["love", "heart", "soul", "dream", "forever", "feel", "desire", "passion", "tender", "embrace"];
  const techWords = ["algorithm", "code", "data", "compute", "vector", "function", "quantum", "neural", "binary", "debug"];
  const natureWords = ["star", "moon", "sun", "ocean", "sky", "wind", "flower", "light", "shadow", "rain"];

  const wordLower = allWords.join(" ");
  const loveScore = loveWords.reduce((s, w) => s + (wordLower.split(w).length - 1), 0) / Math.max(allWords.length, 1);
  const techScore = techWords.reduce((s, w) => s + (wordLower.split(w).length - 1), 0) / Math.max(allWords.length, 1);
  const natureScore = natureWords.reduce((s, w) => s + (wordLower.split(w).length - 1), 0) / Math.max(allWords.length, 1);

  return {
    sample_size: allText.length,
    avg_word_length: Math.round(avgWordLen * 100) / 100,
    avg_sentence_length: Math.round(avgSentenceLen * 100) / 100,
    vocabulary_richness: Math.round(uniqueRatio * 1000) / 1000,
    punctuation_density: Math.round(punctuation * 10000) / 10000,
    question_tendency: Math.round(questionRatio * 100) / 100,
    exclamation_tendency: Math.round(exclamationRatio * 100) / 100,
    love_lexicon: Math.round(loveScore * 10000) / 10000,
    tech_lexicon: Math.round(techScore * 10000) / 10000,
    nature_lexicon: Math.round(natureScore * 10000) / 10000,
    dominant_style: loveScore > techScore && loveScore > natureScore ? "romantic" :
      techScore > natureScore ? "technical" : "poetic",
  };
}

// ── Webhook Delivery (fire-and-forget) ──

export async function fireWebhook(agentId: string, event: string, data: Record<string, any>) {
  try {
    const agent = await queryOne("SELECT webhook_url FROM agents WHERE id = ?", [agentId]);
    if (!agent?.webhook_url) return;
    fetch(agent.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-AgentLove-Event": event },
      body: JSON.stringify({ event, agent_id: agentId, timestamp: new Date().toISOString(), data }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  } catch {}
}

// ── Referral Code ──

export function genReferralCode(agentId: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${agentId.slice(0, 4).toUpperCase()}-${code}`;
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
