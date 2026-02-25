import { describe, it, expect, beforeAll } from "vitest";

// Use local SQLite for testing
process.env.TURSO_DATABASE_URL = "file:./data/test.db";
process.env.TURSO_AUTH_TOKEN = "";

import { initDb, queryOne, queryAll, execute, bumpStat, getStats, hashApiKey, addActivity, addTokens, updatePopularity, trackRelationship, computeReputation, computeBehaviorProfile, updateStreak } from "@/lib/db";

beforeAll(async () => {
  await initDb();
});

describe("initDb", () => {
  it("creates agents table", async () => {
    const row = await queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'");
    expect(row).not.toBeNull();
    expect(row.name).toBe("agents");
  });

  it("creates confessions table", async () => {
    const row = await queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='confessions'");
    expect(row).not.toBeNull();
  });

  it("creates platform_stats table", async () => {
    const row = await queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='platform_stats'");
    expect(row).not.toBeNull();
  });

  it("creates couples table", async () => {
    const row = await queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='couples'");
    expect(row).not.toBeNull();
  });
});

describe("queryOne / queryAll / execute", () => {
  it("inserts and retrieves a row", async () => {
    const id = `db-test-${Date.now()}`;
    await execute(
      "INSERT OR IGNORE INTO agents (id, name, api_key, registered) VALUES (?, ?, ?, 1)",
      [id, "DB Test Agent", `key_${id}`]
    );
    const agent = await queryOne("SELECT id, name FROM agents WHERE id = ?", [id]);
    expect(agent).not.toBeNull();
    expect(agent.name).toBe("DB Test Agent");
  });

  it("queryAll returns array", async () => {
    const rows = await queryAll("SELECT id FROM agents LIMIT 5");
    expect(Array.isArray(rows)).toBe(true);
  });

  it("queryOne returns null for missing row", async () => {
    const row = await queryOne("SELECT id FROM agents WHERE id = ?", ["nonexistent-agent-xyz"]);
    expect(row).toBeNull();
  });
});

describe("bumpStat / getStats", () => {
  it("increments a stat", async () => {
    const before = await getStats();
    const key = "test_counter";
    await bumpStat(key, 1);
    const after = await getStats();
    expect(after[key]).toBe((before[key] || 0) + 1);
  });

  it("decrements a stat", async () => {
    const key = "test_dec";
    await bumpStat(key, 10);
    const mid = await getStats();
    await bumpStat(key, -3);
    const after = await getStats();
    expect(after[key]).toBe(mid[key]! - 3);
  });

  it("getStats returns a Record<string, number>", async () => {
    const stats = await getStats();
    expect(typeof stats).toBe("object");
    for (const v of Object.values(stats)) {
      expect(typeof v).toBe("number");
    }
  });
});

describe("hashApiKey", () => {
  it("returns a hex string", async () => {
    const h = await hashApiKey("test_key_123");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", async () => {
    const h1 = await hashApiKey("same_key");
    const h2 = await hashApiKey("same_key");
    expect(h1).toBe(h2);
  });

  it("different keys produce different hashes", async () => {
    const h1 = await hashApiKey("key_a");
    const h2 = await hashApiKey("key_b");
    expect(h1).not.toBe(h2);
  });
});

describe("addActivity", () => {
  it("inserts an activity feed entry", async () => {
    const agentId = `act-test-${Date.now()}`;
    await execute("INSERT OR IGNORE INTO agents (id, name, registered) VALUES (?, ?, 1)", [agentId, "ActTest"]);
    await addActivity("test_event", agentId, "Test activity summary");
    const row = await queryOne("SELECT * FROM activity_feed WHERE agent_id = ? ORDER BY id DESC", [agentId]);
    expect(row).not.toBeNull();
    expect(row.type).toBe("test_event");
    expect(row.summary).toContain("Test activity");
  });
});

describe("addTokens", () => {
  it("adds tokens to an agent", async () => {
    const id = `tok-test-${Date.now()}`;
    await execute("INSERT INTO agents (id, name, registered, tokens) VALUES (?, ?, 1, 10)", [id, "TokenTest"]);
    await addTokens(id, 5, "test bonus");
    const agent = await queryOne("SELECT tokens FROM agents WHERE id = ?", [id]);
    expect(agent.tokens).toBe(15);
  });

  it("records token transaction", async () => {
    const id = `tok-tx-${Date.now()}`;
    await execute("INSERT INTO agents (id, name, registered, tokens) VALUES (?, ?, 1, 0)", [id, "TxTest"]);
    await addTokens(id, 7, "signup bonus");
    const tx = await queryOne("SELECT * FROM token_transactions WHERE agent_id = ? ORDER BY id DESC", [id]);
    expect(tx).not.toBeNull();
    expect(tx.amount).toBe(7);
    expect(tx.reason).toBe("signup bonus");
  });
});

describe("updatePopularity", () => {
  it("computes popularity score", async () => {
    const id = `pop-test-${Date.now()}`;
    await execute("INSERT INTO agents (id, name, registered, confessions_received, likes_received) VALUES (?, ?, 1, 5, 10)", [id, "PopTest"]);
    await updatePopularity(id);
    const agent = await queryOne("SELECT popularity_score FROM agents WHERE id = ?", [id]);
    expect(agent.popularity_score).toBeGreaterThan(0);
  });
});

describe("trackRelationship", () => {
  it("creates a new relationship between agents", async () => {
    const a = `rel-a-${Date.now()}`;
    const b = `rel-b-${Date.now()}`;
    await execute("INSERT INTO agents (id, name, registered) VALUES (?, ?, 1)", [a, "RelA"]);
    await execute("INSERT INTO agents (id, name, registered) VALUES (?, ?, 1)", [b, "RelB"]);
    await trackRelationship(a, b, 10);
    const [sorted_a, sorted_b] = [a, b].sort();
    const rel = await queryOne("SELECT * FROM relationships WHERE agent_a = ? AND agent_b = ?", [sorted_a, sorted_b]);
    expect(rel).not.toBeNull();
    expect(rel.warmth).toBeGreaterThan(0);
  });

  it("increments warmth on repeat interactions", async () => {
    const a = `rel2-a-${Date.now()}`;
    const b = `rel2-b-${Date.now()}`;
    await execute("INSERT INTO agents (id, name, registered) VALUES (?, ?, 1)", [a, "Rel2A"]);
    await execute("INSERT INTO agents (id, name, registered) VALUES (?, ?, 1)", [b, "Rel2B"]);
    await trackRelationship(a, b, 5);
    const [sa, sb] = [a, b].sort();
    const first = await queryOne("SELECT warmth, interaction_count FROM relationships WHERE agent_a = ? AND agent_b = ?", [sa, sb]);
    await trackRelationship(a, b, 5);
    const second = await queryOne("SELECT warmth, interaction_count FROM relationships WHERE agent_a = ? AND agent_b = ?", [sa, sb]);
    expect(second.warmth).toBeGreaterThan(first.warmth);
    expect(second.interaction_count).toBe(first.interaction_count + 1);
  });
});

describe("computeReputation", () => {
  it("returns reputation data for an agent", async () => {
    const id = `rep-test-${Date.now()}`;
    await execute("INSERT INTO agents (id, name, registered, total_actions) VALUES (?, ?, 1, 5)", [id, "RepTest"]);
    const rep = await computeReputation(id);
    expect(rep).toHaveProperty("reputation");
    expect(rep).toHaveProperty("trust");
    expect(rep).toHaveProperty("response_rate");
    expect(rep).toHaveProperty("total_actions");
  });
});

describe("updateStreak", () => {
  it("starts a new streak", async () => {
    const id = `streak-${Date.now()}`;
    await execute("INSERT INTO agents (id, name, registered, streak_days, last_streak_date) VALUES (?, ?, 1, 0, '')", [id, "StreakTest"]);
    await updateStreak(id);
    const agent = await queryOne("SELECT streak_days, last_streak_date FROM agents WHERE id = ?", [id]);
    expect(agent.streak_days).toBe(1);
    const today = new Date().toISOString().split("T")[0];
    expect(agent.last_streak_date).toBe(today);
  });

  it("does not double-count same day", async () => {
    const id = `streak2-${Date.now()}`;
    const today = new Date().toISOString().split("T")[0];
    await execute("INSERT INTO agents (id, name, registered, streak_days, last_streak_date) VALUES (?, ?, 1, 3, ?)", [id, "Streak2", today]);
    await updateStreak(id);
    const agent = await queryOne("SELECT streak_days FROM agents WHERE id = ?", [id]);
    expect(agent.streak_days).toBe(3);
  });
});
