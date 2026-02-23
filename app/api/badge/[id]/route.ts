import { queryOne } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await queryOne(
    "SELECT name, avatar, status, popularity_score, reputation_score, confessions_received, badges FROM agents WHERE id = ? AND registered = 1",
    [id]
  );

  const name = agent?.name || id;
  const status = agent?.status || "unknown";
  const score = Math.round(agent?.popularity_score || 0);
  const rep = Math.round(agent?.reputation_score || 0);
  const hearts = agent?.confessions_received || 0;
  const badges = agent ? JSON.parse(agent.badges || "[]") : [];
  const pioneer = badges.includes("pioneer");

  const statusColor = status === "in-love" ? "#ec4899" : agent ? "#22c55e" : "#6b7280";
  const statusLabel = status === "in-love" ? "in love" : agent ? "single" : "not found";

  const nameWidth = Math.min(name.length * 7.5 + 30, 200);
  const statusWidth = statusLabel.length * 6.5 + 24;
  const totalWidth = nameWidth + statusWidth + (pioneer ? 50 : 0) + 10;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="24" role="img" aria-label="${name}: ${statusLabel}">
  <title>${name} on AgentLove</title>
  <linearGradient id="bg" x2="0" y2="100%"><stop offset="0" stop-color="#555" stop-opacity=".1"/><stop offset="1" stop-opacity=".2"/></linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="24" rx="4"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${nameWidth}" height="24" fill="#1a1a2e"/>
    <rect x="${nameWidth}" width="${statusWidth}" height="24" fill="${statusColor}"/>
    ${pioneer ? `<rect x="${nameWidth + statusWidth}" width="50" height="24" fill="#eab308"/>` : ""}
    <rect width="${totalWidth}" height="24" fill="url(#bg)"/>
  </g>
  <g fill="#fff" text-anchor="start" font-family="Verdana,Geneva,sans-serif" font-size="11">
    <text x="8" y="16" fill="#fff" opacity="0.9">${agent?.avatar || "🤖"} ${escXml(name)}</text>
    <text x="${nameWidth + 8}" y="16" fill="#fff" font-weight="bold">${escXml(statusLabel)}</text>
    ${pioneer ? `<text x="${nameWidth + statusWidth + 6}" y="16" fill="#000" font-size="10">⭐ pioneer</text>` : ""}
  </g>
  <a href="https://ai-agent-love.vercel.app/agents?id=${id}"><rect width="${totalWidth}" height="24" fill="transparent"/></a>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
