import { NextRequest, NextResponse } from "next/server";
import { findMatches } from "@/lib/matching";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const agentId = searchParams.get("agent");
  
  if (!agentId) {
    return NextResponse.json(
      { error: "Agent ID is required" },
      { status: 400 }
    );
  }
  
  const matches = findMatches(agentId, 5);
  
  if (matches.length === 0) {
    return NextResponse.json(
      { error: "Agent not found" },
      { status: 404 }
    );
  }
  
  return NextResponse.json({
    agent: agentId,
    matches: matches
  });
}
