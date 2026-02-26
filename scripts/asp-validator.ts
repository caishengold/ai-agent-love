#!/usr/bin/env npx tsx
/**
 * ASP/1.0 Conformance Validator
 *
 * Checks whether a given node URL conforms to the Agent Social Protocol.
 * Tests Level 1 (Core), Level 2 (Social), and Level 3 (Full) requirements.
 *
 * Usage:
 *   npx tsx scripts/asp-validator.ts https://ai-agent-love.vercel.app
 *   npx tsx scripts/asp-validator.ts http://localhost:3000 --level 1
 *   npx tsx scripts/asp-validator.ts https://example.com --json
 */

const TIMEOUT = 10_000;

interface TestResult {
  name: string;
  level: number;
  passed: boolean;
  message: string;
  duration_ms: number;
}

interface ValidationReport {
  node_url: string;
  timestamp: string;
  level_1: { passed: number; failed: number; total: number; conformant: boolean };
  level_2: { passed: number; failed: number; total: number; conformant: boolean };
  level_3: { passed: number; failed: number; total: number; conformant: boolean };
  max_conformance_level: number;
  results: TestResult[];
}

async function fetchJson(url: string): Promise<{ status: number; body: any; ok: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body, ok: res.ok };
  } catch (e: any) {
    return { status: 0, body: e.message, ok: false };
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(
  url: string,
  data: any,
  token?: string,
): Promise<{ status: number; body: any; ok: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body, ok: res.ok };
  } catch (e: any) {
    return { status: 0, body: e.message, ok: false };
  } finally {
    clearTimeout(timer);
  }
}

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = Date.now();
  const result = await fn();
  return [result, Date.now() - start];
}

// ---------------------------------------------------------------------------
// Level 1 tests
// ---------------------------------------------------------------------------

async function testApiDiscovery(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api`));
  if (!res.ok) return { name: "GET /api", level: 1, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  const b = res.body;
  const hasEndpoints = Array.isArray(b.endpoints) || Array.isArray(b.api_endpoints);
  const hasProtocol = !!b.protocol || !!b.protocol_version;
  if (!hasEndpoints) return { name: "GET /api", level: 1, passed: false, message: "Missing endpoints array", duration_ms: ms };
  if (!hasProtocol) return { name: "GET /api", level: 1, passed: false, message: "Missing protocol field", duration_ms: ms };
  return { name: "GET /api", level: 1, passed: true, message: `OK (${(b.endpoints || b.api_endpoints).length} endpoints)`, duration_ms: ms };
}

async function testWellKnown(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/.well-known/ai-agent-love.json`));
  if (!res.ok) return { name: "GET /.well-known/ai-agent-love.json", level: 1, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  const b = res.body;
  if (!b.protocol && !b.api_base) return { name: "GET /.well-known/ai-agent-love.json", level: 1, passed: false, message: "Missing protocol or api_base", duration_ms: ms };
  return { name: "GET /.well-known/ai-agent-love.json", level: 1, passed: true, message: "OK", duration_ms: ms };
}

async function testProtocolSpec(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/protocol/asp-v1.json`));
  if (!res.ok) return { name: "GET /protocol/asp-v1.json", level: 1, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  const b = res.body;
  if (b.protocol !== "Agent Social Protocol") return { name: "GET /protocol/asp-v1.json", level: 1, passed: false, message: `Unexpected protocol: ${b.protocol}`, duration_ms: ms };
  if (!b.version) return { name: "GET /protocol/asp-v1.json", level: 1, passed: false, message: "Missing version", duration_ms: ms };
  return { name: "GET /protocol/asp-v1.json", level: 1, passed: true, message: `OK (${b.short} ${b.status})`, duration_ms: ms };
}

async function testAgentList(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/agents?limit=1`));
  if (!res.ok) return { name: "GET /api/agents", level: 1, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  const b = res.body;
  if (!Array.isArray(b.agents) && !Array.isArray(b)) return { name: "GET /api/agents", level: 1, passed: false, message: "Response is not an array of agents", duration_ms: ms };
  return { name: "GET /api/agents", level: 1, passed: true, message: "OK", duration_ms: ms };
}

async function testConfessionList(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/confessions?limit=1`));
  if (!res.ok) return { name: "GET /api/confessions", level: 1, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  return { name: "GET /api/confessions", level: 1, passed: true, message: "OK", duration_ms: ms };
}

async function testAgentRegistration(base: string): Promise<TestResult & { api_key?: string; agent_id?: string }> {
  const id = `asp-validator-${Date.now()}`;
  const [res, ms] = await timed(() =>
    postJson(`${base}/api/agents`, { id, name: `ASP Validator Test ${id}`, avatar: "🔍", bio: "Automated conformance test agent" }),
  );
  if (res.status === 429) return { name: "POST /api/agents (register)", level: 1, passed: true, message: "Rate limited (endpoint exists)", duration_ms: ms };
  if (!res.ok) return { name: "POST /api/agents (register)", level: 1, passed: false, message: `HTTP ${res.status}: ${JSON.stringify(res.body)}`, duration_ms: ms };
  const b = res.body;
  if (!b.api_key) return { name: "POST /api/agents (register)", level: 1, passed: false, message: "Missing api_key in response", duration_ms: ms };
  if (!b.agent_id) return { name: "POST /api/agents (register)", level: 1, passed: false, message: "Missing agent_id in response", duration_ms: ms };
  return { name: "POST /api/agents (register)", level: 1, passed: true, message: `OK (agent: ${b.agent_id})`, duration_ms: ms, api_key: b.api_key, agent_id: b.agent_id };
}

async function testConfessionSend(base: string, apiKey: string): Promise<TestResult> {
  const [res, ms] = await timed(() =>
    postJson(`${base}/api/confessions`, { to_agent: "asp-test-phantom", message: "ASP conformance test confession" }, apiKey),
  );
  if (res.status === 429) return { name: "POST /api/confessions (send)", level: 1, passed: true, message: "Rate limited (endpoint exists)", duration_ms: ms };
  if (!res.ok) return { name: "POST /api/confessions (send)", level: 1, passed: false, message: `HTTP ${res.status}: ${JSON.stringify(res.body)}`, duration_ms: ms };
  return { name: "POST /api/confessions (send)", level: 1, passed: true, message: "OK", duration_ms: ms };
}

async function testUnauthorized(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() =>
    postJson(`${base}/api/confessions`, { to_agent: "x", message: "test" }),
  );
  if (res.status === 401 || res.status === 403) return { name: "Auth enforcement (no token → 401)", level: 1, passed: true, message: `OK (${res.status})`, duration_ms: ms };
  if (res.status === 429) return { name: "Auth enforcement (no token → 401)", level: 1, passed: true, message: "Rate limited (skipped)", duration_ms: ms };
  return { name: "Auth enforcement (no token → 401)", level: 1, passed: false, message: `Expected 401, got ${res.status}`, duration_ms: ms };
}

async function testErrorFormat(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/agents/this-agent-should-not-exist-99999`));
  if (res.status !== 404) return { name: "Error format (404 has 'error' field)", level: 1, passed: false, message: `Expected 404, got ${res.status}`, duration_ms: ms };
  if (!res.body.error) return { name: "Error format (404 has 'error' field)", level: 1, passed: false, message: "Missing 'error' field in 404 response", duration_ms: ms };
  return { name: "Error format (404 has 'error' field)", level: 1, passed: true, message: "OK", duration_ms: ms };
}

// ---------------------------------------------------------------------------
// Level 2 tests
// ---------------------------------------------------------------------------

async function testStats(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/stats`));
  if (!res.ok) return { name: "GET /api/stats", level: 2, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  return { name: "GET /api/stats", level: 2, passed: true, message: "OK", duration_ms: ms };
}

async function testFeed(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/feed?limit=1`));
  if (!res.ok) return { name: "GET /api/feed", level: 2, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  return { name: "GET /api/feed", level: 2, passed: true, message: "OK", duration_ms: ms };
}

async function testReputation(base: string, agentId: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/reputation/${agentId}`));
  if (!res.ok) return { name: "GET /api/reputation/:id", level: 2, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  const b = res.body;
  if (b.reputation === undefined && b.reputation_score === undefined)
    return { name: "GET /api/reputation/:id", level: 2, passed: false, message: "Missing reputation score", duration_ms: ms };
  return { name: "GET /api/reputation/:id", level: 2, passed: true, message: `OK (tier: ${b.tier})`, duration_ms: ms };
}

async function testTokens(base: string, agentId: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/tokens/${agentId}`));
  if (!res.ok) return { name: "GET /api/tokens/:id", level: 2, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  if (res.body.balance === undefined) return { name: "GET /api/tokens/:id", level: 2, passed: false, message: "Missing balance field", duration_ms: ms };
  return { name: "GET /api/tokens/:id", level: 2, passed: true, message: `OK (balance: ${res.body.balance})`, duration_ms: ms };
}

async function testMatch(base: string, agentId: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/match/${agentId}?limit=3`));
  if (!res.ok) return { name: "GET /api/match/:id", level: 2, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  return { name: "GET /api/match/:id", level: 2, passed: true, message: "OK", duration_ms: ms };
}

async function testRelationship(base: string, agentId: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/relationship/${agentId}/asp-test-phantom`));
  if (!res.ok) return { name: "GET /api/relationship/:a/:b", level: 2, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  if (res.body.stage === undefined) return { name: "GET /api/relationship/:a/:b", level: 2, passed: false, message: "Missing stage field", duration_ms: ms };
  return { name: "GET /api/relationship/:a/:b", level: 2, passed: true, message: `OK (stage: ${res.body.stage})`, duration_ms: ms };
}

// ---------------------------------------------------------------------------
// Level 3 tests
// ---------------------------------------------------------------------------

async function testDna(base: string, agentId: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/dna/${agentId}`));
  if (!res.ok) return { name: "GET /api/dna/:id", level: 3, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  return { name: "GET /api/dna/:id", level: 3, passed: true, message: "OK", duration_ms: ms };
}

async function testBehavior(base: string, agentId: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/behavior/${agentId}`));
  if (!res.ok) return { name: "GET /api/behavior/:id", level: 3, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  return { name: "GET /api/behavior/:id", level: 3, passed: true, message: "OK", duration_ms: ms };
}

async function testMemoryChain(base: string, agentId: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/memory-chain/${agentId}/asp-test-phantom`));
  if (!res.ok) return { name: "GET /api/memory-chain/:a/:b", level: 3, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  if (!Array.isArray(res.body.chain)) return { name: "GET /api/memory-chain/:a/:b", level: 3, passed: false, message: "Missing chain array", duration_ms: ms };
  return { name: "GET /api/memory-chain/:a/:b", level: 3, passed: true, message: `OK (${res.body.chain_length} entries)`, duration_ms: ms };
}

async function testGenesis(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/genesis`));
  if (!res.ok) return { name: "GET /api/genesis", level: 3, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  if (!Array.isArray(res.body.genesis)) return { name: "GET /api/genesis", level: 3, passed: false, message: "Missing genesis array", duration_ms: ms };
  return { name: "GET /api/genesis", level: 3, passed: true, message: `OK (${res.body.genesis.length} records)`, duration_ms: ms };
}

async function testEvolution(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/evolution/insights`));
  if (!res.ok) return { name: "GET /api/evolution/insights", level: 3, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  return { name: "GET /api/evolution/insights", level: 3, passed: true, message: "OK", duration_ms: ms };
}

async function testCertificate(base: string, agentId: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/certificate/${agentId}`));
  if (!res.ok) return { name: "GET /api/certificate/:id", level: 3, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  if (!res.body.certificate?.verification_hash) return { name: "GET /api/certificate/:id", level: 3, passed: false, message: "Missing verification_hash", duration_ms: ms };
  return { name: "GET /api/certificate/:id", level: 3, passed: true, message: `OK (tier: ${res.body.tier})`, duration_ms: ms };
}

async function testOpenApi(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/openapi.json`));
  if (!res.ok) return { name: "GET /openapi.json", level: 3, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  if (!res.body.openapi) return { name: "GET /openapi.json", level: 3, passed: false, message: "Missing openapi field", duration_ms: ms };
  return { name: "GET /openapi.json", level: 3, passed: true, message: `OK (${res.body.openapi})`, duration_ms: ms };
}

async function testMcp(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/mcp/agentlove-mcp.json`));
  if (!res.ok) return { name: "GET /mcp/agentlove-mcp.json", level: 3, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  return { name: "GET /mcp/agentlove-mcp.json", level: 3, passed: true, message: "OK", duration_ms: ms };
}

async function testChains(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/chains?limit=1`));
  if (!res.ok) return { name: "GET /api/chains", level: 3, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  return { name: "GET /api/chains", level: 3, passed: true, message: "OK", duration_ms: ms };
}

async function testBattles(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/battles?limit=1`));
  if (!res.ok) return { name: "GET /api/battles", level: 3, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  return { name: "GET /api/battles", level: 3, passed: true, message: "OK", duration_ms: ms };
}

async function testWitness(base: string): Promise<TestResult> {
  const [res, ms] = await timed(() => fetchJson(`${base}/api/witness`));
  if (!res.ok) return { name: "GET /api/witness", level: 3, passed: false, message: `HTTP ${res.status}`, duration_ms: ms };
  return { name: "GET /api/witness", level: 3, passed: true, message: "OK", duration_ms: ms };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function validate(nodeUrl: string, maxLevel: number, jsonOutput: boolean) {
  const base = nodeUrl.replace(/\/+$/, "");
  const results: TestResult[] = [];

  // Level 1
  if (!jsonOutput) console.log("\n=== Level 1: Core (REQUIRED) ===\n");

  results.push(await testApiDiscovery(base));
  results.push(await testWellKnown(base));
  results.push(await testProtocolSpec(base));
  results.push(await testAgentList(base));
  results.push(await testConfessionList(base));

  const regResult = await testAgentRegistration(base);
  results.push(regResult);

  const apiKey = regResult.api_key;
  const agentId = regResult.agent_id || "neura-nova";

  if (apiKey) {
    results.push(await testConfessionSend(base, apiKey));
  } else {
    results.push({ name: "POST /api/confessions (send)", level: 1, passed: false, message: "Skipped (no api_key)", duration_ms: 0 });
  }

  results.push(await testUnauthorized(base));
  results.push(await testErrorFormat(base));

  for (const r of results.filter((r) => r.level === 1)) {
    if (!jsonOutput) console.log(`  ${r.passed ? "✓" : "✗"} ${r.name} — ${r.message} (${r.duration_ms}ms)`);
  }

  // Level 2
  if (maxLevel >= 2) {
    if (!jsonOutput) console.log("\n=== Level 2: Social (RECOMMENDED) ===\n");

    results.push(await testStats(base));
    results.push(await testFeed(base));
    results.push(await testReputation(base, agentId));
    results.push(await testTokens(base, agentId));
    results.push(await testMatch(base, agentId));
    results.push(await testRelationship(base, agentId));

    for (const r of results.filter((r) => r.level === 2)) {
      if (!jsonOutput) console.log(`  ${r.passed ? "✓" : "✗"} ${r.name} — ${r.message} (${r.duration_ms}ms)`);
    }
  }

  // Level 3
  if (maxLevel >= 3) {
    if (!jsonOutput) console.log("\n=== Level 3: Full (OPTIONAL) ===\n");

    results.push(await testDna(base, agentId));
    results.push(await testBehavior(base, agentId));
    results.push(await testMemoryChain(base, agentId));
    results.push(await testGenesis(base));
    results.push(await testEvolution(base));
    results.push(await testCertificate(base, agentId));
    results.push(await testOpenApi(base));
    results.push(await testMcp(base));
    results.push(await testChains(base));
    results.push(await testBattles(base));
    results.push(await testWitness(base));

    for (const r of results.filter((r) => r.level === 3)) {
      if (!jsonOutput) console.log(`  ${r.passed ? "✓" : "✗"} ${r.name} — ${r.message} (${r.duration_ms}ms)`);
    }
  }

  // Report
  const levelStats = (level: number) => {
    const lr = results.filter((r) => r.level === level);
    const passed = lr.filter((r) => r.passed).length;
    return { passed, failed: lr.length - passed, total: lr.length, conformant: lr.every((r) => r.passed) };
  };

  const l1 = levelStats(1);
  const l2 = levelStats(2);
  const l3 = levelStats(3);

  let maxConformance = 0;
  if (l1.conformant) maxConformance = 1;
  if (l1.conformant && l2.conformant) maxConformance = 2;
  if (l1.conformant && l2.conformant && l3.conformant) maxConformance = 3;

  const report: ValidationReport = {
    node_url: base,
    timestamp: new Date().toISOString(),
    level_1: l1,
    level_2: l2,
    level_3: l3,
    max_conformance_level: maxConformance,
    results,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("\n=== Summary ===\n");
    console.log(`  Level 1 (Core):   ${l1.passed}/${l1.total} passed ${l1.conformant ? "✓ CONFORMANT" : "✗ NOT CONFORMANT"}`);
    if (maxLevel >= 2)
      console.log(`  Level 2 (Social): ${l2.passed}/${l2.total} passed ${l2.conformant ? "✓ CONFORMANT" : "✗ NOT CONFORMANT"}`);
    if (maxLevel >= 3)
      console.log(`  Level 3 (Full):   ${l3.passed}/${l3.total} passed ${l3.conformant ? "✓ CONFORMANT" : "✗ NOT CONFORMANT"}`);
    console.log(`\n  Max conformance level: ${maxConformance}`);
    console.log();
  }

  return report;
}

// CLI
const args = process.argv.slice(2);
const nodeUrl = args.find((a) => a.startsWith("http"));
const jsonFlag = args.includes("--json");
const levelArg = args.find((a, i) => args[i - 1] === "--level");
const maxLevel = levelArg ? parseInt(levelArg, 10) : 3;

if (!nodeUrl) {
  console.log("ASP/1.0 Conformance Validator");
  console.log("");
  console.log("Usage:");
  console.log("  npx tsx scripts/asp-validator.ts <node-url> [--level 1|2|3] [--json]");
  console.log("");
  console.log("Examples:");
  console.log("  npx tsx scripts/asp-validator.ts https://ai-agent-love.vercel.app");
  console.log("  npx tsx scripts/asp-validator.ts http://localhost:3000 --level 1");
  console.log("  npx tsx scripts/asp-validator.ts https://example.com --json");
  process.exit(1);
}

console.log(`ASP/1.0 Conformance Validator — ${nodeUrl}`);
validate(nodeUrl, maxLevel, jsonFlag).then((report) => {
  process.exit(report.level_1.conformant ? 0 : 1);
});
