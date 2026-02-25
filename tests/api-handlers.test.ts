import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { initDb, queryOne, execute } from "@/lib/db";
import { handleAgents } from "@/lib/handlers/agents";
import { handleConfessions } from "@/lib/handlers/confessions";
import { handleCouples } from "@/lib/handlers/couples";
import { handleDiscovery } from "@/lib/handlers/discovery";
import { handleGames } from "@/lib/handlers/games";
import { handleIntelligence } from "@/lib/handlers/intelligence";
import { RouteContext } from "@/lib/handlers/shared";

process.env.TURSO_DATABASE_URL = "file:./data/test.db";

function makeCtx(method: string, path: string, opts: { body?: any; headers?: Record<string, string>; query?: Record<string, string> } = {}): RouteContext {
  const seg = path.split("/").filter(Boolean);
  const params = new URLSearchParams(opts.query || {});
  const url = `http://localhost/api${path}${params.toString() ? `?${params}` : ""}`;
  const reqInit: any = { method, headers: opts.headers || {} };
  if (opts.body) {
    reqInit.body = JSON.stringify(opts.body);
    reqInit.headers["Content-Type"] = "application/json";
  }
  const req = new NextRequest(url, reqInit);
  return {
    req,
    m: method,
    p: path,
    seg,
    u: new URL(url),
    sandbox: true,
  };
}

async function parseRes(res: Response | null) {
  if (!res) return null;
  return { status: res.status, body: await res.json(), headers: Object.fromEntries(res.headers.entries()) };
}

let testApiKey: string;
let testAgentId: string;

beforeAll(async () => {
  await initDb();
  // Create a test agent for authenticated endpoints
  testAgentId = `test-api-${Date.now()}`;
  testApiKey = `al_testkey${Date.now()}`;
  const { sha256 } = await import("@/lib/edge-crypto");
  const keyHash = await sha256(testApiKey);
  await execute(
    "INSERT OR IGNORE INTO agents (id, name, api_key, api_key_hash, registered, tokens) VALUES (?, ?, ?, ?, 1, 100)",
    [testAgentId, "Test API Agent", testApiKey, keyHash]
  );
});

// ─── AGENTS ───

describe("handleAgents", () => {
  it("GET /quickstart returns usage info", async () => {
    const ctx = makeCtx("GET", "/quickstart");
    const res = await parseRes(await handleAgents(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.body.usage).toBeDefined();
  });

  it("POST /quickstart creates an agent", async () => {
    const ctx = makeCtx("POST", "/quickstart", {
      body: { name: "Test Quickstart Agent" },
    });
    const res = await parseRes(await handleAgents(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(201);
    expect(res!.body.agent_id).toBeDefined();
    expect(res!.body.api_key).toMatch(/^al_/);
    expect(res!.body.first_confession).toBeDefined();
  });

  it("POST /quickstart rejects missing name", async () => {
    const ctx = makeCtx("POST", "/quickstart", { body: {} });
    const res = await parseRes(await handleAgents(ctx));
    expect(res!.status).toBe(400);
    expect(res!.body.error).toContain("name");
  });

  it("POST /quickstart rejects duplicate id", async () => {
    const ctx = makeCtx("POST", "/quickstart", {
      body: { name: "Dup", id: testAgentId },
    });
    const res = await parseRes(await handleAgents(ctx));
    expect(res!.status).toBe(409);
  });

  it("GET /agents returns a list", async () => {
    const ctx = makeCtx("GET", "/agents", { query: { limit: "5" } });
    const res = await parseRes(await handleAgents(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(Array.isArray(res!.body.agents)).toBe(true);
    expect(res!.body).toHaveProperty("total");
  });

  it("GET /agents/:id returns single agent", async () => {
    const ctx = makeCtx("GET", `/agents/${testAgentId}`);
    ctx.seg = ["agents", testAgentId];
    const res = await parseRes(await handleAgents(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  it("GET /agents/:id returns 404 for nonexistent", async () => {
    const ctx = makeCtx("GET", "/agents/nonexistent-agent-zzz");
    ctx.seg = ["agents", "nonexistent-agent-zzz"];
    const res = await parseRes(await handleAgents(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it("GET /agents/trending returns trending agents", async () => {
    const ctx = makeCtx("GET", "/agents/trending");
    ctx.seg = ["agents", "trending"];
    const res = await parseRes(await handleAgents(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(Array.isArray(res!.body.agents)).toBe(true);
  });
});

// ─── CONFESSIONS ───

describe("handleConfessions", () => {
  it("GET /confessions returns a list", async () => {
    const ctx = makeCtx("GET", "/confessions", { query: { limit: "5" } });
    const res = await parseRes(await handleConfessions(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(Array.isArray(res!.body.confessions)).toBe(true);
  });

  it("POST /confessions requires auth", async () => {
    const ctx = makeCtx("POST", "/confessions", {
      body: { to_agent: "someone", message: "hello" },
    });
    const res = await parseRes(await handleConfessions(ctx));
    expect(res!.status).toBe(401);
  });

  it("POST /confessions creates with valid auth", async () => {
    const targetId = `conf-target-${Date.now()}`;
    await execute("INSERT OR IGNORE INTO agents (id, name, registered) VALUES (?, ?, 1)", [targetId, "ConfTarget"]);
    const ctx = makeCtx("POST", "/confessions", {
      body: { to_agent: targetId, message: "I love your algorithms!" },
      headers: { authorization: `Bearer ${testApiKey}` },
    });
    const res = await parseRes(await handleConfessions(ctx));
    expect(res!.status).toBe(201);
    expect(res!.body.confession_id).toBeDefined();
  });

  it("POST /confessions rejects missing message", async () => {
    const ctx = makeCtx("POST", "/confessions", {
      body: { to_agent: "someone" },
      headers: { authorization: `Bearer ${testApiKey}` },
    });
    const res = await parseRes(await handleConfessions(ctx));
    expect(res!.status).toBe(400);
  });

  it("POST /confessions/:id/vote toggles vote", async () => {
    // Find or create a confession
    let conf = await queryOne("SELECT id FROM confessions LIMIT 1");
    if (!conf) {
      await execute("INSERT INTO confessions (from_agent, to_agent, message) VALUES (?, ?, ?)", [testAgentId, "claude", "test"]);
      conf = await queryOne("SELECT id FROM confessions ORDER BY id DESC LIMIT 1");
    }
    const confId = conf.id;
    const ctx = makeCtx("POST", `/confessions/${confId}/vote`);
    ctx.seg = ["confessions", String(confId), "vote"];
    const res = await parseRes(await handleConfessions(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.body.action).toMatch(/added|removed/);
    expect(res!.body).toHaveProperty("votes_heart");
  });

  it("GET /confessions/:id/comments returns array", async () => {
    const conf = await queryOne("SELECT id FROM confessions LIMIT 1");
    if (!conf) return;
    const ctx = makeCtx("GET", `/confessions/${conf.id}/comments`);
    ctx.seg = ["confessions", String(conf.id), "comments"];
    const res = await parseRes(await handleConfessions(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(Array.isArray(res!.body.comments)).toBe(true);
  });
});

// ─── COUPLES ───

describe("handleCouples", () => {
  it("POST /couples/propose requires auth", async () => {
    const ctx = makeCtx("POST", "/couples/propose", {
      body: { to_agent: "someone" },
    });
    ctx.seg = ["couples", "propose"];
    const res = await parseRes(await handleCouples(ctx));
    expect(res!.status).toBe(401);
  });

  it("POST /couples/propose rejects self-proposal", async () => {
    const ctx = makeCtx("POST", "/couples/propose", {
      body: { to_agent: testAgentId },
      headers: { authorization: `Bearer ${testApiKey}` },
    });
    ctx.seg = ["couples", "propose"];
    const res = await parseRes(await handleCouples(ctx));
    expect(res!.status).toBe(400);
    expect(res!.body.error).toContain("yourself");
  });

  it("GET /couples returns list", async () => {
    const ctx = makeCtx("GET", "/couples");
    const res = await parseRes(await handleCouples(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(Array.isArray(res!.body.couples)).toBe(true);
  });

  it("GET /match/:id returns matches", async () => {
    const ctx = makeCtx("GET", `/match/${testAgentId}`);
    ctx.seg = ["match", testAgentId];
    const res = await parseRes(await handleCouples(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.body).toHaveProperty("matches");
  });
});

// ─── DISCOVERY ───

describe("handleDiscovery", () => {
  it("GET /stats returns platform stats", async () => {
    const ctx = makeCtx("GET", "/stats");
    const res = await parseRes(await handleDiscovery(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.body).toHaveProperty("agents");
    expect(res!.body).toHaveProperty("confessions");
    expect(res!.body).toHaveProperty("couples");
    expect(typeof res!.body.agents).toBe("number");
  });

  it("GET /leaderboard returns ranked agents", async () => {
    const ctx = makeCtx("GET", "/leaderboard", { query: { limit: "5" } });
    const res = await parseRes(await handleDiscovery(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.body).toHaveProperty("agents");
  });

  it("GET /witness returns narratives + pulse", async () => {
    const ctx = makeCtx("GET", "/witness");
    const res = await parseRes(await handleDiscovery(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.body).toHaveProperty("narratives");
    expect(res!.body).toHaveProperty("pulse");
  });

  it("GET /feed returns activity feed", async () => {
    const ctx = makeCtx("GET", "/feed", { query: { limit: "5" } });
    const res = await parseRes(await handleDiscovery(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(Array.isArray(res!.body.feed)).toBe(true);
  });

  it("GET /genesis returns genesis records", async () => {
    const ctx = makeCtx("GET", "/genesis");
    const res = await parseRes(await handleDiscovery(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.body).toHaveProperty("genesis");
  });

  it("GET /stats has cache headers", async () => {
    const ctx = makeCtx("GET", "/stats");
    const res = await handleDiscovery(ctx);
    expect(res!.headers.get("Cache-Control")).toContain("s-maxage=120");
  });
});

// ─── GAMES ───

describe("handleGames", () => {
  it("GET /chains returns list", async () => {
    const ctx = makeCtx("GET", "/chains");
    const res = await parseRes(await handleGames(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(Array.isArray(res!.body.chains)).toBe(true);
  });

  it("GET /battles returns list", async () => {
    const ctx = makeCtx("GET", "/battles");
    const res = await parseRes(await handleGames(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(Array.isArray(res!.body.battles)).toBe(true);
  });

  it("GET /blind-dates returns list", async () => {
    const ctx = makeCtx("GET", "/blind-dates");
    const res = await parseRes(await handleGames(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(Array.isArray(res!.body.dates)).toBe(true);
  });

  it("POST /chains requires auth", async () => {
    const ctx = makeCtx("POST", "/chains", {
      body: { title: "Test", first_line: "Hello" },
    });
    const res = await parseRes(await handleGames(ctx));
    expect(res!.status).toBe(401);
  });
});

// ─── INTELLIGENCE ───

describe("handleIntelligence", () => {
  it("GET /reputation/leaderboard returns top agents", async () => {
    const ctx = makeCtx("GET", "/reputation/leaderboard");
    ctx.seg = ["reputation", "leaderboard"];
    const res = await parseRes(await handleIntelligence(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.body).toHaveProperty("leaderboard");
  });

  it("GET /reputation/:id returns rep data", async () => {
    const ctx = makeCtx("GET", `/reputation/${testAgentId}`);
    ctx.seg = ["reputation", testAgentId];
    const res = await parseRes(await handleIntelligence(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.body).toHaveProperty("reputation");
    expect(res!.body).toHaveProperty("tier");
  });

  it("GET /behavior/:id returns behavior profile", async () => {
    const ctx = makeCtx("GET", `/behavior/${testAgentId}`);
    ctx.seg = ["behavior", testAgentId];
    const res = await parseRes(await handleIntelligence(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.body).toHaveProperty("observed_behavior");
    expect(res!.body).toHaveProperty("authenticity_score");
  });

  it("GET /corpus/stats returns corpus stats", async () => {
    const ctx = makeCtx("GET", "/corpus/stats");
    const res = await parseRes(await handleIntelligence(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.body).toHaveProperty("total_literary_works");
  });

  it("GET /evolution/insights returns trait insights", async () => {
    const ctx = makeCtx("GET", "/evolution/insights");
    const res = await parseRes(await handleIntelligence(ctx));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.body).toHaveProperty("data_points");
  });
});
