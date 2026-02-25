import { describe, it, expect, vi } from "vitest";
import { genKey, slugify, cosineSim, json, checkWriteOrigin, testFilter, getIp, voterHash } from "@/lib/handlers/shared";
import { NextRequest } from "next/server";

describe("genKey", () => {
  it("starts with al_ prefix", () => {
    expect(genKey()).toMatch(/^al_/);
  });

  it("is 35 characters (3 prefix + 32 random)", () => {
    expect(genKey()).toHaveLength(35);
  });

  it("contains only alphanumeric characters after prefix", () => {
    const key = genKey();
    expect(key.slice(3)).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 100 }, () => genKey()));
    expect(keys.size).toBe(100);
  });
});

describe("slugify", () => {
  it("lowercases and removes special chars", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });

  it("collapses multiple separators", () => {
    expect(slugify("a---b...c")).toBe("a-b-c");
  });

  it("trims leading/trailing dashes", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("truncates to 36 chars", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(36);
  });

  it("returns 'agent' for empty or symbol-only strings", () => {
    expect(slugify("!!!")).toBe("agent");
    expect(slugify("")).toBe("agent");
  });

  it("handles unicode", () => {
    expect(slugify("My Bot 🤖")).toBe("my-bot");
  });
});

describe("cosineSim", () => {
  it("returns 1 for identical vectors", () => {
    const v = { a: 0.5, b: 0.8, c: 0.3 };
    expect(cosineSim(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = { x: 1, y: 0 };
    const b = { x: 0, y: 1 };
    expect(cosineSim(a, b)).toBeCloseTo(0, 5);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSim({}, {})).toBe(0);
  });

  it("handles partially overlapping keys", () => {
    const a = { x: 1, y: 2 };
    const b = { y: 3, z: 4 };
    const result = cosineSim(a, b);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it("handles single-dimension vectors", () => {
    expect(cosineSim({ x: 5 }, { x: 10 })).toBeCloseTo(1, 5);
  });
});

describe("json helper", () => {
  it("returns correct status code", () => {
    const res = json({ ok: true }, 201);
    expect(res.status).toBe(201);
  });

  it("returns JSON content type", () => {
    const res = json({ hello: "world" });
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("sets CORS headers", () => {
    const res = json({});
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("sets cache headers when cacheSeconds > 0", () => {
    const res = json({}, 200, 60);
    const cc = res.headers.get("Cache-Control")!;
    expect(cc).toContain("s-maxage=60");
    expect(cc).toContain("stale-while-revalidate=120");
  });

  it("does not set cache headers when cacheSeconds = 0", () => {
    const res = json({}, 200, 0);
    expect(res.headers.get("Cache-Control")).toBeNull();
  });

  it("serializes body as JSON", async () => {
    const res = json({ key: "value" });
    const body = await res.json();
    expect(body.key).toBe("value");
  });
});

describe("getIp", () => {
  it("extracts IP from x-forwarded-for", () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getIp(req)).toBe("1.2.3.4");
  });

  it("returns unknown when no IP headers", () => {
    const req = new NextRequest("http://localhost/api/test");
    expect(getIp(req)).toBe("unknown");
  });
});

describe("voterHash", () => {
  it("returns a 24-char hex string", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "user-agent": "TestBot/1.0",
      },
    });
    const h = await voterHash(req);
    expect(h).toHaveLength(24);
    expect(h).toMatch(/^[0-9a-f]{24}$/);
  });

  it("produces same hash for same request fingerprint", async () => {
    const headers = { "x-forwarded-for": "1.2.3.4", "user-agent": "Bot" };
    const r1 = new NextRequest("http://localhost/a", { headers });
    const r2 = new NextRequest("http://localhost/b", { headers });
    expect(await voterHash(r1)).toBe(await voterHash(r2));
  });

  it("produces different hash for different IPs", async () => {
    const r1 = new NextRequest("http://localhost/", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    const r2 = new NextRequest("http://localhost/", {
      headers: { "x-forwarded-for": "2.2.2.2" },
    });
    expect(await voterHash(r1)).not.toBe(await voterHash(r2));
  });
});

describe("checkWriteOrigin", () => {
  it("allows requests with no origin (server-to-server)", () => {
    const req = new NextRequest("http://localhost/api/test", { method: "POST" });
    expect(checkWriteOrigin(req)).toBeNull();
  });

  it("allows allowed origins", () => {
    const req = new NextRequest("http://localhost/api/test", {
      method: "POST",
      headers: { origin: "https://ai-agent-love.vercel.app" },
    });
    expect(checkWriteOrigin(req)).toBeNull();
  });

  it("allows dev origins", () => {
    const req = new NextRequest("http://localhost/api/test", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    expect(checkWriteOrigin(req)).toBeNull();
  });

  it("blocks unknown origins", () => {
    const req = new NextRequest("http://localhost/api/test", {
      method: "POST",
      headers: { origin: "https://evil.com" },
    });
    const res = checkWriteOrigin(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });
});

describe("testFilter", () => {
  it("generates SQL filter excluding test patterns", () => {
    const filter = testFilter("id");
    expect(filter).toContain("id NOT LIKE 'test%'");
    expect(filter).toContain("id NOT LIKE 'e2e%'");
    expect(filter).toContain(" AND ");
  });

  it("uses custom column name", () => {
    const filter = testFilter("agent_id");
    expect(filter).toContain("agent_id NOT LIKE");
  });
});
