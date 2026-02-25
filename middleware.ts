import { NextRequest, NextResponse } from "next/server";

// Edge-level rate limiting (per region, much better than per-instance)
const edgeBuckets = new Map<string, { count: number; reset: number }>();
const EDGE_LIMIT = 300;       // requests per IP per window
const EDGE_WRITE_LIMIT = 60;  // POST/PUT per IP per window
const EDGE_WINDOW = 60_000;

// Known attack tool user-agents
const BLOCKED_UA = /sqlmap|nikto|nmap|masscan|zgrab|dirbuster|gobuster|hydra|medusa|wfuzz|nuclei|acunetix/i;

// Dynamic IP blacklist (populated at runtime from abuse detection)
const ipBlacklist = new Set<string>();
const ipAbuseScore = new Map<string, number>();

function getIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

export function middleware(req: NextRequest) {
  const ip = getIp(req);
  const ua = req.headers.get("user-agent") || "";
  const method = req.method;
  const isApi = req.nextUrl.pathname.startsWith("/api");

  // --- Blocked IP ---
  if (ipBlacklist.has(ip)) {
    return NextResponse.json(
      { error: "Access denied" },
      { status: 403, headers: { "Retry-After": "3600" } }
    );
  }

  // --- Block attack tools (empty UA also suspicious but allowed for curl) ---
  if (BLOCKED_UA.test(ua)) {
    bumpAbuse(ip, 50);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Request body size limit (512 KB for API, generous enough for vectors) ---
  if (isApi) {
    const cl = req.headers.get("content-length");
    if (cl && parseInt(cl, 10) > 524_288) {
      return NextResponse.json(
        { error: "Request body too large (max 512KB)" },
        { status: 413 }
      );
    }
  }

  // --- Edge rate limiting ---
  if (isApi) {
    const now = Date.now();
    const isWrite = method === "POST" || method === "PUT" || method === "DELETE";
    const bucketKey = `${ip}:${isWrite ? "w" : "r"}`;
    const limit = isWrite ? EDGE_WRITE_LIMIT : EDGE_LIMIT;

    const bucket = edgeBuckets.get(bucketKey);
    if (!bucket || now > bucket.reset) {
      edgeBuckets.set(bucketKey, { count: 1, reset: now + EDGE_WINDOW });
    } else {
      bucket.count++;
      if (bucket.count > limit) {
        bumpAbuse(ip, 5);
        return NextResponse.json(
          { error: "Too many requests", retry_after_ms: bucket.reset - now },
          { status: 429, headers: { "Retry-After": String(Math.ceil((bucket.reset - now) / 1000)) } }
        );
      }
    }

    // Periodic cleanup (prevent memory leak)
    if (edgeBuckets.size > 50_000) {
      edgeBuckets.forEach((v, k) => { if (now > v.reset) edgeBuckets.delete(k); });
    }
  }

  // --- Security response headers ---
  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isApi) {
    res.headers.set("X-RateLimit-Remaining", String(Math.max(0, EDGE_LIMIT - (edgeBuckets.get(`${ip}:r`)?.count || 0))));
  }
  return res;
}

function bumpAbuse(ip: string, score: number) {
  const cur = (ipAbuseScore.get(ip) || 0) + score;
  ipAbuseScore.set(ip, cur);
  if (cur >= 100) {
    ipBlacklist.add(ip);
    // Auto-unblock after 1 hour
    setTimeout(() => { ipBlacklist.delete(ip); ipAbuseScore.delete(ip); }, 3_600_000);
  }
}

export const config = {
  matcher: ["/api/:path*", "/agents/:path*", "/confessions/:path*", "/leaderboard/:path*"],
};
