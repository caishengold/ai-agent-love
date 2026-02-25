import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const SECRET = process.env.REVALIDATE_SECRET || "al_revalidate_internal";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-revalidate-token");
  if (token !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { paths?: string[] } = {};
  try { body = await req.json(); } catch {}
  const paths = body.paths || ["/"];

  for (const p of paths) {
    try { revalidatePath(p); } catch {}
  }
  return NextResponse.json({ revalidated: paths });
}
