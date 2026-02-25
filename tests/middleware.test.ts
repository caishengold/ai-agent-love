import { describe, it, expect } from "vitest";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

let uid = 0;
function uniqueIp() { return `10.0.${Math.floor(uid / 256)}.${(uid++) % 256}`; }

function makeReq(path: string, opts: { method?: string; headers?: Record<string, string>; ip?: string } = {}) {
  const url = `http://localhost${path}`;
  const headers: Record<string, string> = {
    "x-forwarded-for": opts.ip || uniqueIp(),
    ...opts.headers,
  };
  return new NextRequest(url, { method: opts.method || "GET", headers });
}

describe("middleware", () => {
  it("allows normal API GET requests", () => {
    const res = middleware(makeReq("/api/stats"));
    expect(res.status).toBe(200);
  });

  it("sets security headers", () => {
    const res = middleware(makeReq("/api/stats"));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("blocks attack tool user agents", () => {
    const ip = uniqueIp();
    const res = middleware(makeReq("/api/stats", {
      ip,
      headers: { "user-agent": "sqlmap/1.0" },
    }));
    expect(res.status).toBe(403);
  });

  it("blocks nikto scanner", () => {
    const ip = uniqueIp();
    const res = middleware(makeReq("/api/stats", {
      ip,
      headers: { "user-agent": "Mozilla/5.0 (Nikto)" },
    }));
    expect(res.status).toBe(403);
  });

  it("rejects oversized request bodies", () => {
    const res = middleware(makeReq("/api/confessions", {
      method: "POST",
      headers: { "content-length": "1000000" },
    }));
    expect(res.status).toBe(413);
  });

  it("allows normal-sized request bodies", () => {
    const res = middleware(makeReq("/api/confessions", {
      method: "POST",
      headers: { "content-length": "500" },
    }));
    expect(res.status).toBe(200);
  });

  it("includes rate limit remaining header for API", () => {
    const res = middleware(makeReq("/api/stats"));
    expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
  });

  it("allows page routes", () => {
    const res = middleware(makeReq("/confessions"));
    expect(res.status).toBe(200);
  });

  it("rate limits excessive reads from same IP", () => {
    const ip = uniqueIp();
    let lastRes;
    for (let i = 0; i < 320; i++) {
      lastRes = middleware(makeReq("/api/stats", { ip }));
    }
    expect(lastRes!.status).toBe(429);
  });

  it("rate limits write endpoints more aggressively", () => {
    const ip = uniqueIp();
    let lastRes;
    for (let i = 0; i < 70; i++) {
      lastRes = middleware(makeReq("/api/confessions", { method: "POST", ip }));
    }
    expect(lastRes!.status).toBe(429);
  });
});
