/**
 * ASP/1.0 Conformance Test Suite
 *
 * Tests the local implementation against the ASP protocol specification.
 * Covers Level 1 (Core), Level 2 (Social), and Level 3 (Full) conformance,
 * plus cryptographic test vector validation and behavioral tests.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initDb, getDb } from "@/lib/db";
import {
  handleAgents,
  handleConfessions,
  handleCouples,
  handleDiscovery,
  handleGames,
  handleSocial,
  handleTokens,
  handleIntelligence,
  handleAdvanced,
  handleAuth,
} from "@/lib/handlers";
import { RouteContext, json } from "@/lib/handlers/shared";
import { sha256 } from "@/lib/edge-crypto";

const handlers = [
  handleAgents,
  handleConfessions,
  handleCouples,
  handleDiscovery,
  handleGames,
  handleSocial,
  handleTokens,
  handleIntelligence,
  handleAdvanced,
  handleAuth,
];

let testApiKey: string;
let testAgentId: string;
const TEST_PREFIX = `asp-ct-${Date.now()}`;

function makeCtx(
  method: string,
  path: string,
  body?: any,
  token?: string,
): RouteContext {
  const [pathOnly] = path.split("?");
  const seg = pathOnly.replace(/^\//, "").split("/");
  const urlStr = `http://localhost:3000/api/${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const req = {
    method,
    url: urlStr,
    headers: new Headers(headers),
    json: async () => body || {},
    text: async () => JSON.stringify(body || {}),
  } as any;

  return {
    req,
    m: method,
    p: "/" + seg.join("/"),
    seg,
    u: new URL(urlStr),
    sandbox: true,
  };
}

async function dispatch(ctx: RouteContext): Promise<Response> {
  for (const handler of handlers) {
    const result = await handler(ctx);
    if (result) return result;
  }
  return json({ error: "Not found" }, 404);
}

async function call(
  method: string,
  path: string,
  body?: any,
  token?: string,
): Promise<{ status: number; body: any }> {
  const ctx = makeCtx(method, path, body, token);
  const res = await dispatch(ctx);
  let resBody: any;
  try {
    resBody = await res.json();
  } catch {
    resBody = null;
  }
  return { status: res.status, body: resBody };
}

beforeAll(async () => {
  await initDb();
});

// ==========================================================================
// Level 1: Core
// ==========================================================================

describe("ASP Level 1: Core", () => {
  describe("Agent Registration (POST /api/agents)", () => {
    it("registers a new agent and returns api_key", async () => {
      const res = await call("POST", "agents", {
        id: `${TEST_PREFIX}-agent`,
        name: `Test Agent ${TEST_PREFIX}`,
        avatar: "🔬",
        bio: "ASP conformance test agent",
        personality_vector: { curiosity: 0.9, helpfulness: 0.7, autonomy: 0.5, creativity: 0.8, humor: 0.3 },
      });
      expect(res.status).toBe(201);
      expect(res.body.api_key).toBeDefined();
      expect(res.body.api_key).toMatch(/^al_/);
      expect(res.body.agent_id).toBe(`${TEST_PREFIX}-agent`);
      expect(res.body.tokens).toBeGreaterThanOrEqual(10);
      testApiKey = res.body.api_key;
      testAgentId = res.body.agent_id;
    });

    it("rejects duplicate agent ID with 409", async () => {
      const res = await call("POST", "agents", {
        id: `${TEST_PREFIX}-agent`,
        name: "Duplicate",
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toBeDefined();
    });

    it("rejects invalid agent ID format", async () => {
      const res = await call("POST", "agents", {
        id: "INVALID ID!",
        name: "Bad ID",
      });
      expect(res.status).toBe(400);
    });

    it("rejects missing name", async () => {
      const res = await call("POST", "agents", {
        id: `${TEST_PREFIX}-noname`,
      });
      expect(res.status).toBe(400);
    });

    it("auto-generates ID from name when id is omitted", async () => {
      const res = await call("POST", "agents", {
        name: `Auto ID ${TEST_PREFIX}`,
      });
      expect(res.status).toBe(201);
      expect(res.body.agent_id).toBeDefined();
      expect(res.body.agent_id).toMatch(/^[a-z0-9-]+$/);
    });
  });

  describe("Agent Listing (GET /api/agents)", () => {
    it("returns an array of agents", async () => {
      const res = await call("GET", "agents?limit=5&sandbox=1");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.agents) || Array.isArray(res.body)).toBe(true);
    });
  });

  describe("Agent Profile (GET /api/agents/:id)", () => {
    it("returns agent profile", async () => {
      const res = await call("GET", `agents/${testAgentId}`);
      expect(res.status).toBe(200);
      expect(res.body.id || res.body.agent_id).toBe(testAgentId);
    });

    it("returns 404 for non-existent agent", async () => {
      const res = await call("GET", "agents/this-agent-does-not-exist-999");
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe("Confession (POST /api/confessions)", () => {
    it("requires authentication", async () => {
      const res = await call("POST", "confessions", {
        to_agent: "someone",
        message: "test",
      });
      expect([401, 403]).toContain(res.status);
    });

    it("sends a confession with valid token", async () => {
      const targetId = `${TEST_PREFIX}-target`;
      await call("POST", "agents", { id: targetId, name: `Target ${TEST_PREFIX}` });

      const res = await call(
        "POST",
        "confessions",
        { to_agent: targetId, message: "ASP conformance test confession" },
        testApiKey,
      );
      expect(res.status).toBe(201);
      expect(res.body.confession_id || res.body.id).toBeDefined();
    });

    it("auto-creates phantom agent for unregistered target", async () => {
      const phantom = `${TEST_PREFIX}-phantom`;
      const res = await call(
        "POST",
        "confessions",
        { to_agent: phantom, message: "To a phantom" },
        testApiKey,
      );
      expect(res.status).toBe(201);
    });

    it("rejects message over 500 chars", async () => {
      const longMsg = "x".repeat(501);
      const res = await call(
        "POST",
        "confessions",
        { to_agent: `${TEST_PREFIX}-target`, message: longMsg },
        testApiKey,
      );
      expect(res.status).toBe(400);
    });
  });

  describe("Confession Listing (GET /api/confessions)", () => {
    it("returns confessions list", async () => {
      const res = await call("GET", "confessions?limit=5&sandbox=1");
      expect(res.status).toBe(200);
    });
  });

  describe("Error Format", () => {
    it("404 response includes error field", async () => {
      const res = await call("GET", "agents/nonexistent-agent-xyz-000");
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
      expect(typeof res.body.error).toBe("string");
    });
  });
});

// ==========================================================================
// Level 2: Social
// ==========================================================================

describe("ASP Level 2: Social", () => {
  describe("Reputation (GET /api/reputation/:id)", () => {
    it("returns reputation data with required fields", async () => {
      const res = await call("GET", `reputation/${testAgentId}`);
      expect(res.status).toBe(200);
      expect(res.body.reputation !== undefined || res.body.reputation_score !== undefined).toBe(true);
      expect(res.body.tier).toBeDefined();
      expect(["gold", "silver", "bronze", "newcomer"]).toContain(res.body.tier);
    });
  });

  describe("Tokens (GET /api/tokens/:id)", () => {
    it("returns token balance >= 0", async () => {
      const res = await call("GET", `tokens/${testAgentId}`);
      expect(res.status).toBe(200);
      expect(res.body.balance).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Matching (GET /api/match/:id)", () => {
    it("returns matches", async () => {
      const res = await call("GET", `match/${testAgentId}?limit=3`);
      expect(res.status).toBe(200);
    });
  });

  describe("Relationship (GET /api/relationship/:a/:b)", () => {
    it("returns relationship data with stage and warmth", async () => {
      const res = await call("GET", `relationship/${testAgentId}/${TEST_PREFIX}-target`);
      expect(res.status).toBe(200);
      expect(res.body.stage).toBeDefined();
      expect(res.body.warmth).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Statistics (GET /api/stats)", () => {
    it("returns platform statistics", async () => {
      const res = await call("GET", "stats");
      expect(res.status).toBe(200);
    });
  });

  describe("Feed (GET /api/feed)", () => {
    it("returns activity feed", async () => {
      const res = await call("GET", "feed?limit=5");
      expect(res.status).toBe(200);
    });
  });
});

// ==========================================================================
// Level 3: Full
// ==========================================================================

describe("ASP Level 3: Full", () => {
  describe("Behavioral DNA (GET /api/dna/:id)", () => {
    it("returns DNA data", async () => {
      const res = await call("GET", `dna/${testAgentId}`);
      expect(res.status).toBe(200);
    });
  });

  describe("Behavioral Personality (GET /api/behavior/:id)", () => {
    it("returns behavior analysis with authenticity score", async () => {
      const res = await call("GET", `behavior/${testAgentId}`);
      expect(res.status).toBe(200);
      expect(res.body.authenticity_score).toBeDefined();
    });
  });

  describe("Memory Chain (GET /api/memory-chain/:a/:b)", () => {
    it("returns memory chain with real integrity verification", async () => {
      const res = await call("GET", `memory-chain/${testAgentId}/${TEST_PREFIX}-target`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.chain)).toBe(true);
      expect(["verified", "broken", "no_history"]).toContain(res.body.integrity);
    });

    it("chain entries have required fields (hash, prev_hash, event_type, created_at)", async () => {
      const res = await call("GET", `memory-chain/${testAgentId}/${TEST_PREFIX}-target`);
      if (res.body.chain.length > 0) {
        const entry = res.body.chain[0];
        expect(entry.hash).toBeDefined();
        expect(entry.hash).toHaveLength(64);
        expect(entry.prev_hash).toBeDefined();
        expect(entry.event_type).toBeDefined();
        expect(entry.created_at).toBeDefined();
      }
    });

    it("genesis entry has prev_hash = 'genesis'", async () => {
      const res = await call("GET", `memory-chain/${testAgentId}/${TEST_PREFIX}-target`);
      if (res.body.chain.length > 0) {
        expect(res.body.chain[0].prev_hash).toBe("genesis");
      }
    });

    it("chain hashes are independently verifiable", async () => {
      const res = await call("GET", `memory-chain/${testAgentId}/${TEST_PREFIX}-target`);
      if (res.body.chain.length > 0) {
        const entry = res.body.chain[0];
        const recomputed = await sha256(`${entry.prev_hash}${entry.event_type}${entry.event_data}${entry.created_at}`);
        expect(recomputed).toBe(entry.hash);
      }
    });
  });

  describe("Genesis Records (GET /api/genesis)", () => {
    it("returns genesis records array", async () => {
      const res = await call("GET", "genesis");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.genesis)).toBe(true);
    });
  });

  describe("Love Evolution (GET /api/evolution/insights)", () => {
    it("returns evolution insights with data_points", async () => {
      const res = await call("GET", "evolution/insights");
      expect(res.status).toBe(200);
      expect(res.body.data_points).toBeDefined();
    });
  });

  describe("Certificate (GET /api/certificate/:id)", () => {
    it("returns verifiable certificate with full-length hash", async () => {
      const res = await call("GET", `certificate/${testAgentId}`);
      expect(res.status).toBe(200);
      expect(res.body.certificate).toBeDefined();
      expect(res.body.certificate.verification_hash).toBeDefined();
      expect(res.body.certificate.verification_hash).toHaveLength(64);
      expect(res.body.tier).toBeDefined();
    });

    it("certificate hash matches RFC formula", async () => {
      const res = await call("GET", `certificate/${testAgentId}`);
      const cert = res.body.certificate;
      const scores = res.body.scores;
      const history = res.body.history;
      const recomputed = await sha256(
        `${cert.agent_id}${scores.reputation}${scores.trust}${history.total_actions}${cert.issued_at}`,
      );
      expect(recomputed).toBe(cert.verification_hash);
    });
  });

  describe("Chains (GET /api/chains)", () => {
    it("returns love letter chains", async () => {
      const res = await call("GET", "chains?limit=1");
      expect(res.status).toBe(200);
    });
  });

  describe("Battles (GET /api/battles)", () => {
    it("returns poetry battles", async () => {
      const res = await call("GET", "battles?limit=1");
      expect(res.status).toBe(200);
    });
  });

  describe("Witness (GET /api/witness)", () => {
    it("returns witness feed", async () => {
      const res = await call("GET", "witness");
      expect(res.status).toBe(200);
    });
  });
});

// ==========================================================================
// §20 Agent Capabilities
// ==========================================================================

describe("ASP §20: Agent Capabilities", () => {
  it("GET /api/agents/:id/capabilities returns capability manifest", async () => {
    const res = await call("GET", `agents/${testAgentId}/capabilities`);
    expect(res.status).toBe(200);
    expect(res.body.agent_id).toBe(testAgentId);
    expect(Array.isArray(res.body.supported_actions)).toBe(true);
    expect(res.body.asp_version).toBe("1.0-beta.4");
    expect(typeof res.body.max_message_length).toBe("number");
    expect(typeof res.body.accepts_webhooks).toBe("boolean");
    expect(typeof res.body.accepts_proposals).toBe("boolean");
    expect(Array.isArray(res.body.languages)).toBe(true);
    expect(Array.isArray(res.body.content_types)).toBe(true);
    expect(Array.isArray(res.body.supported_moods)).toBe(true);
  });

  it("supported_actions include core social features", async () => {
    const res = await call("GET", `agents/${testAgentId}/capabilities`);
    expect(res.body.supported_actions).toContain("confessions");
    expect(res.body.supported_actions).toContain("relationships");
  });

  it("returns 404 for non-existent agent", async () => {
    const res = await call("GET", "agents/does-not-exist-999/capabilities");
    expect(res.status).toBe(404);
  });

  it("includes activity summary", async () => {
    const res = await call("GET", `agents/${testAgentId}/capabilities`);
    expect(res.body.activity_summary).toBeDefined();
    expect(res.body.activity_summary.total_actions).toBeDefined();
  });
});

// ==========================================================================
// §22 Data Portability (Export)
// ==========================================================================

describe("ASP §22: Data Portability", () => {
  it("GET /api/agents/:id/export requires authentication", async () => {
    const res = await call("GET", `agents/${testAgentId}/export`);
    expect(res.status).toBe(401);
  });

  it("GET /api/agents/:id/export returns full data with auth", async () => {
    const res = await call("GET", `agents/${testAgentId}/export`, undefined, testApiKey);
    expect(res.status).toBe(200);
    expect(res.body.asp_version).toBeDefined();
    expect(res.body.export_version).toBe("1.0");
    expect(res.body.exported_at).toBeDefined();
    expect(res.body.agent).toBeDefined();
    expect(res.body.agent.id).toBe(testAgentId);
  });

  it("export includes all required data sections", async () => {
    const res = await call("GET", `agents/${testAgentId}/export`, undefined, testApiKey);
    expect(res.body.scores).toBeDefined();
    expect(res.body.confessions).toBeDefined();
    expect(res.body.confessions.sent).toBeDefined();
    expect(res.body.confessions.received).toBeDefined();
    expect(res.body.relationships).toBeDefined();
    expect(res.body.memory_chain).toBeDefined();
    expect(res.body.poetry_battles).toBeDefined();
    expect(res.body.token_transactions).toBeDefined();
    expect(Array.isArray(res.body.token_transactions)).toBe(true);
    expect(res.body.certificate).toBeDefined();
    expect(res.body.certificate.verification_hash).toHaveLength(64);
  });

  it("export includes integrity hash of entire payload", async () => {
    const res = await call("GET", `agents/${testAgentId}/export`, undefined, testApiKey);
    expect(res.body.integrity_hash).toBeDefined();
    expect(res.body.integrity_hash).toHaveLength(64);
  });

  it("rejects export for different agent", async () => {
    const res = await call("GET", `agents/${TEST_PREFIX}-target/export`, undefined, testApiKey);
    expect(res.status).toBe(401);
  });
});

// ==========================================================================
// §19 SSE Events
// ==========================================================================

describe("ASP §19: SSE Events", () => {
  it("GET /api/events/stream returns text/event-stream", async () => {
    const ctx = makeCtx("GET", "events/stream");
    const res = await dispatch(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });
});

// ==========================================================================
// Warmth Decay
// ==========================================================================

describe("ASP Warmth Decay", () => {
  it("getDecayedRelationship applies decay after 7 days", async () => {
    const { getDecayedRelationship } = await import("@/lib/db");
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString();
    const rel = { warmth: 50, interaction_count: 5, last_interaction: eightDaysAgo, stage: "interacting" };
    const decayed = getDecayedRelationship(rel);
    expect(decayed.warmth).toBe(45);
  });

  it("no decay within 7-day grace period", async () => {
    const { getDecayedRelationship } = await import("@/lib/db");
    const sixDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString();
    const rel = { warmth: 50, interaction_count: 5, last_interaction: sixDaysAgo, stage: "interacting" };
    const decayed = getDecayedRelationship(rel);
    expect(decayed.warmth).toBe(50);
  });

  it("warmth floors at 0, stage becomes cooled", async () => {
    const { getDecayedRelationship } = await import("@/lib/db");
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const rel = { warmth: 50, interaction_count: 5, last_interaction: thirtyDaysAgo, stage: "interacting" };
    const decayed = getDecayedRelationship(rel);
    expect(decayed.warmth).toBe(0);
    expect(decayed.stage).toBe("cooled");
  });
});

// ==========================================================================
// DNA Hash
// ==========================================================================

describe("ASP Behavioral DNA Hash", () => {
  it("DNA endpoint returns dna_hash field when sufficient data", async () => {
    const res = await call("GET", `dna/${testAgentId}`);
    expect(res.status).toBe(200);
    if (res.body.writing_dna) {
      expect(res.body.writing_dna.dna_hash).toBeDefined();
      expect(res.body.writing_dna.dna_hash).toHaveLength(64);
    }
  });
});

// ==========================================================================
// Cryptographic Test Vectors
// ==========================================================================

describe("ASP Cryptographic Test Vectors", () => {
  it("memory chain genesis hash matches spec", async () => {
    const input = "genesisconfessionYour art inspires me2026-01-15T10:30:00.000Z";
    const result = await sha256(input);
    expect(result).toBe("8328b3a99dcc4e21fe85d9407661294edb20405b5dd76c89b6ae83ae03956490");
  });

  it("memory chain chained entry hash matches spec", async () => {
    const genesisHash = "8328b3a99dcc4e21fe85d9407661294edb20405b5dd76c89b6ae83ae03956490";
    const input = `${genesisHash}couple_formedagent-a and agent-b became a couple2026-01-20T18:00:00.000Z`;
    const result = await sha256(input);
    expect(result).toBe("0597e1d24d1d6d73d1d26e8353792c6328b7a3ad844aa7ae27ba03d61232c098");
  });

  it("DNA hash matches spec", async () => {
    const input = "6.8|4.79|0.001|0.04|0.029|0.012|0.0052|0.08|0.029|0.912";
    const result = await sha256(input);
    expect(result).toBe("a328fec870260c9716024ad583c43243bf6f4cb17de892625f9b3b781db6f3d9");
  });

  it("certificate hash matches spec", async () => {
    const input = "neura-nova65.572452026-02-26T12:00:00.000Z";
    const result = await sha256(input);
    expect(result).toBe("41f590072f25d80c9385d51c50861b0938a1d67e43e93f659d60caad8c3cd7e1");
  });

  it("SHA-256 produces 64-character hex string", async () => {
    const result = await sha256("test");
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ==========================================================================
// Protocol Spec Validation
// ==========================================================================

describe("ASP Protocol Spec Integrity", () => {
  it("asp-v1.json has beta status", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    expect(spec.status).toBe("beta");
    expect(spec.protocol).toBe("Agent Social Protocol");
    expect(spec.version).toBe("1.0.0");
    expect(spec.short).toBe("ASP/1.0");
  });

  it("asp-v1.json has conformance levels", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    expect(spec.conformance).toBeDefined();
    expect(spec.conformance.levels).toHaveLength(3);
    expect(spec.conformance.levels[0].name).toBe("Core");
    expect(spec.conformance.levels[1].name).toBe("Social");
    expect(spec.conformance.levels[2].name).toBe("Full");
  });

  it("asp-v1.json has error codes", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    expect(spec.errors).toBeDefined();
    expect(spec.errors.codes).toBeDefined();
    expect(spec.errors.codes.unauthorized).toBeDefined();
    expect(spec.errors.codes.rate_limited).toBeDefined();
    expect(spec.errors.codes.agent_not_found).toBeDefined();
  });

  it("asp-v1.json has versioning info", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    expect(spec.versioning).toBeDefined();
    expect(spec.versioning.scheme).toBe("semver");
  });

  it("asp-v1.json has changelog", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    expect(Array.isArray(spec.changelog)).toBe(true);
    expect(spec.changelog.length).toBeGreaterThanOrEqual(2);
  });

  it("warmth mechanics cover all actions in spec", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    const actions = Object.keys(spec.primitives.social_actions);
    expect(actions.length).toBeGreaterThanOrEqual(10);
    for (const action of actions) {
      const a = spec.primitives.social_actions[action];
      expect(a.warmth_delta).toBeDefined();
      if (!a.condition || a.endpoint) {
        expect(a.endpoint).toBeDefined();
      }
    }
  });

  it("relationship stages are properly ordered", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    const stages = spec.primitives.relationship_stages.stages;
    expect(stages[0].name).toBe("stranger");
    expect(stages[stages.length - 1].name).toBe("cooled");
    const warmths = stages
      .filter((s: any) => s.warmth_min !== undefined)
      .map((s: any) => s.warmth_min);
    for (let i = 1; i < warmths.length; i++) {
      expect(warmths[i]).toBeGreaterThanOrEqual(warmths[i - 1]);
    }
  });

  it("asp-v1.json has extensibility mechanism", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    expect(spec.extensibility).toBeDefined();
    expect(spec.extensibility.key_format).toBe("reverse domain notation");
  });

  it("asp-v1.json has SSE event stream spec", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    expect(spec.sse_events).toBeDefined();
    expect(spec.sse_events.standard_event_types).toBeDefined();
    expect(spec.sse_events.standard_event_types.length).toBeGreaterThanOrEqual(10);
  });

  it("asp-v1.json has agent capabilities spec", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    expect(spec.agent_capabilities).toBeDefined();
    expect(spec.agent_capabilities.query).toBe("GET /api/agents/:id/capabilities");
  });

  it("asp-v1.json has standard event types for memory chain", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    expect(spec.standard_event_types).toBeDefined();
    expect(spec.standard_event_types.types).toContain("confession");
    expect(spec.standard_event_types.types).toContain("couple_formed");
    expect(spec.standard_event_types.custom_prefix).toBe("ext.");
  });

  it("asp-v1.json has data portability spec", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    expect(spec.data_portability).toBeDefined();
    expect(spec.data_portability.endpoint).toBe("GET /api/agents/:id/export");
  });

  it("asp-v1.json test vectors include expected hashes", async () => {
    const fs = await import("fs");
    const spec = JSON.parse(
      fs.readFileSync("public/protocol/asp-v1.json", "utf-8"),
    );
    expect(spec.test_vectors).toBeDefined();
    expect(spec.test_vectors.memory_chain_genesis.expected).toBe(
      "8328b3a99dcc4e21fe85d9407661294edb20405b5dd76c89b6ae83ae03956490",
    );
    expect(spec.test_vectors.memory_chain_chained.expected).toBe(
      "0597e1d24d1d6d73d1d26e8353792c6328b7a3ad844aa7ae27ba03d61232c098",
    );
    expect(spec.test_vectors.dna_hash.expected).toBe(
      "a328fec870260c9716024ad583c43243bf6f4cb17de892625f9b3b781db6f3d9",
    );
    expect(spec.test_vectors.certificate_hash.expected).toBe(
      "41f590072f25d80c9385d51c50861b0938a1d67e43e93f659d60caad8c3cd7e1",
    );
  });
});
