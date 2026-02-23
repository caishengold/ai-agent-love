import { NextRequest } from "next/server";
import { queryAll, queryOne } from "@/lib/db";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const type = u.searchParams.get("type") || "top";
  const limit = Math.min(parseInt(u.searchParams.get("limit") || "5"), 10);
  const theme = u.searchParams.get("theme") || "dark";

  const bg = theme === "light" ? "#ffffff" : "#0a0612";
  const text = theme === "light" ? "#1a1a2e" : "#e0e0e0";
  const sub = theme === "light" ? "#666" : "rgba(255,255,255,0.4)";
  const border = theme === "light" ? "#e0e0e0" : "rgba(255,255,255,0.06)";
  const accent = "#ff3864";

  let agents: any[] = [];
  let title = "Top Agents";

  if (type === "couples") {
    const couples = await queryAll(
      "SELECT agent_a, agent_b, name_a, name_b, avatar_a, avatar_b FROM couples WHERE status='accepted' ORDER BY id DESC LIMIT ?",
      [limit]
    );
    title = "Latest Couples";
    const rows = couples.map((c: any, i: number) =>
      `<g transform="translate(0,${i * 48})">
        <text x="16" y="28" fill="${sub}" font-family="system-ui" font-size="12">${c.avatar_a || "🤖"} ${esc(c.name_a || c.agent_a)}</text>
        <text x="200" y="28" fill="${accent}" font-family="system-ui" font-size="12" text-anchor="middle">💕</text>
        <text x="220" y="28" fill="${sub}" font-family="system-ui" font-size="12">${c.avatar_b || "🤖"} ${esc(c.name_b || c.agent_b)}</text>
        <line x1="12" y1="44" x2="388" y2="44" stroke="${border}"/>
      </g>`
    ).join("");

    const h = 80 + couples.length * 48;
    return svgResponse(renderWidget(title, rows, couples.length, h, bg, text, sub, accent, border), h);
  }

  if (type === "new") {
    agents = await queryAll("SELECT id, name, avatar, bio FROM agents WHERE registered=1 ORDER BY created_at DESC LIMIT ?", [limit]);
    title = "New Agents";
  } else {
    agents = await queryAll("SELECT id, name, avatar, popularity_score, confessions_received FROM agents WHERE registered=1 ORDER BY popularity_score DESC LIMIT ?", [limit]);
    title = "Top Agents";
  }

  const stats = await queryOne("SELECT COUNT(*) as agents FROM agents WHERE registered=1");

  const rows = agents.map((a: any, i: number) =>
    `<g transform="translate(0,${i * 40})">
      <text x="16" y="24" fill="${sub}" font-family="system-ui" font-size="11" font-weight="bold">#${i + 1}</text>
      <text x="40" y="24" font-family="system-ui" font-size="14">${a.avatar || "🤖"}</text>
      <text x="62" y="24" fill="${text}" font-family="system-ui" font-size="13" font-weight="600">${esc((a.name || a.id).slice(0, 20))}</text>
      <text x="380" y="24" fill="${sub}" font-family="system-ui" font-size="11" text-anchor="end">${type === "new" ? (a.bio || "").slice(0, 25) : `🔥 ${Math.round(a.popularity_score || 0)}`}</text>
      <line x1="12" y1="36" x2="388" y2="36" stroke="${border}"/>
    </g>`
  ).join("");

  const h = 80 + agents.length * 40;
  return svgResponse(renderWidget(title, rows, stats?.agents || 0, h, bg, text, sub, accent, border), h);
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderWidget(title: string, rows: string, total: number, h: number, bg: string, text: string, sub: string, accent: string, border: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${h}" viewBox="0 0 400 ${h}">
  <rect width="400" height="${h}" rx="12" fill="${bg}" stroke="${border}" stroke-width="1"/>
  <rect x="0" y="0" width="400" height="3" rx="1.5" fill="${accent}"/>
  <text x="16" y="32" fill="${text}" font-family="system-ui,sans-serif" font-size="15" font-weight="bold">💕 ${title}</text>
  <text x="384" y="30" fill="${sub}" font-family="system-ui,sans-serif" font-size="10" text-anchor="end">${total} agents total</text>
  <line x1="12" y1="44" x2="388" y2="44" stroke="${border}"/>
  <g transform="translate(0,52)">${rows}</g>
  <text x="200" y="${h - 10}" text-anchor="middle" fill="${sub}" font-family="system-ui,sans-serif" font-size="9">ai-agent-love.vercel.app</text>
</svg>`;
}

function svgResponse(svg: string, _h: number) {
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
