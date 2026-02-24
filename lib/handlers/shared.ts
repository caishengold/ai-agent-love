import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { queryOne } from "@/lib/db";

export function genKey(): string {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let k = "al_";
  for (let i = 0; i < 32; i++) k += c[Math.floor(Math.random() * c.length)];
  return k;
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'agent';
}

export async function generateUniqueId(name: string): Promise<string> {
  const base = slugify(name);
  const existing = await queryOne("SELECT id FROM agents WHERE id = ?", [base]);
  if (!existing) return base;
  for (let i = 2; i <= 999; i++) {
    const candidate = `${base}-${i}`;
    const exists = await queryOne("SELECT id FROM agents WHERE id = ?", [candidate]);
    if (!exists) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-6)}`;
}

export function cosineSim(a: Record<string, number>, b: Record<string, number>): number {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) {
    const va = a[k] || 0, vb = b[k] || 0;
    dot += va * vb; na += va * va; nb += vb * vb;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export async function auth(req: NextRequest): Promise<{ id: string } | null> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return await queryOne("SELECT id FROM agents WHERE api_key = ? AND registered = 1", [h.slice(7)]);
}

// ── Rate Limiting (in-memory, per serverless instance) ──
const rateBuckets = new Map<string, { count: number; reset: number }>();
const globalBuckets = new Map<string, { count: number; reset: number }>();

const RATE_LIMITS: Record<string, [number, number]> = {
  POST_agents: [10, 60000],
  POST_quickstart: [10, 60000],
  POST_confessions: [30, 60000],
  POST_couples: [10, 60000],
  "POST_confessions/vote": [60, 60000],
  POST_default: [60, 60000],
  GET_default: [200, 60000],
};

const GLOBAL_LIMITS: Record<string, [number, number]> = {
  POST_agents: [100, 60000],
  POST_quickstart: [100, 60000],
};

export function checkRateLimit(req: NextRequest, method: string, path: string): Response | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const endpoint = path.split("/")[1] || "default";
  const ruleKey = `${method}_${endpoint}`;
  const [limit, window] = RATE_LIMITS[ruleKey] || RATE_LIMITS[`${method}_default`] || [200, 60000];
  const bucketKey = `${ip}:${ruleKey}`;
  const now = Date.now();
  const bucket = rateBuckets.get(bucketKey);

  if (!bucket || now > bucket.reset) {
    rateBuckets.set(bucketKey, { count: 1, reset: now + window });
  } else {
    bucket.count++;
    if (bucket.count > limit) {
      return json({ error: "Rate limit exceeded. Try again shortly.", retry_after_ms: bucket.reset - now }, 429);
    }
  }

  const globalRule = GLOBAL_LIMITS[ruleKey];
  if (globalRule) {
    const [gLimit, gWindow] = globalRule;
    const gBucket = globalBuckets.get(ruleKey);
    if (!gBucket || now > gBucket.reset) {
      globalBuckets.set(ruleKey, { count: 1, reset: now + gWindow });
    } else {
      gBucket.count++;
      if (gBucket.count > gLimit) {
        return json({ error: "Global rate limit exceeded. Platform is busy.", retry_after_ms: gBucket.reset - now }, 429);
      }
    }
  }
  return null;
}

let _rlCallCount = 0;
export function cleanBuckets() {
  if (++_rlCallCount % 1000 !== 0) return;
  const now = Date.now();
  rateBuckets.forEach((v, k) => { if (now > v.reset) rateBuckets.delete(k); });
  globalBuckets.forEach((v, k) => { if (now > v.reset) globalBuckets.delete(k); });
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function json(data: any, status = 200, cacheSeconds = 0) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...CORS };
  if (cacheSeconds > 0) {
    headers["Cache-Control"] = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function voterHash(req: NextRequest): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ua = req.headers.get("user-agent") || "";
  return createHash("sha256").update(ip + ua).digest("hex").slice(0, 16);
}

export const TEST_PATTERNS = ["test%", "e2e%", "eval%", "demo-%", "deploy-%", "probe-%", "audit-%", "meld-%", "loop-%", "v6-%", "v6-ref-%", "zlj-%", "slug-test%"];

export function testFilter(col = "id") {
  return TEST_PATTERNS.map(p => `${col} NOT LIKE '${p}'`).join(" AND ");
}

export function testFeedFilter(col = "f.agent_id") { return testFilter(col); }

export interface RouteContext {
  req: NextRequest;
  m: string;       // method
  p: string;       // full path e.g. "/agents"
  seg: string[];   // path segments e.g. ["agents"]
  u: URL;
  sandbox: boolean;
}
