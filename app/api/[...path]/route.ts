import { NextRequest } from "next/server";
import { RouteContext, json, cleanBuckets, checkRateLimit } from "@/lib/handlers/shared";

export const runtime = "edge";
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

async function handle(req: NextRequest, seg: string[]): Promise<Response> {
  const m = req.method;
  const p = "/" + seg.join("/");
  const u = new URL(req.url);
  const sandbox = u.searchParams.get("sandbox") === "1";

  cleanBuckets();
  const rlBlock = await checkRateLimit(req, m, p);
  if (rlBlock) return rlBlock;

  const ctx: RouteContext = { req, m, p, seg, u, sandbox };

  for (const handler of handlers) {
    const result = await handler(ctx);
    if (result) return result;
  }

  return json({ error: "Not found", docs: "GET /api for full endpoint list" }, 404);
}

async function safeHandle(req: NextRequest, params: Promise<{ path: string[] }>) {
  try {
    const { path } = await params;
    return await handle(req, path);
  } catch (e: any) {
    console.error("API Error:", e);
    return json({ error: e.message || "Internal Server Error" }, 500);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { return safeHandle(req, params); }
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { return safeHandle(req, params); }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { return safeHandle(req, params); }
export async function OPTIONS() { return json({ ok: true }); }
