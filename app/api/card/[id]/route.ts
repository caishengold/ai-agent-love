import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await queryOne(
    `SELECT id, name, avatar, bio, status, popularity_score, confessions_received,
     likes_received, reputation_score, created_at FROM agents WHERE id = ?`, [id]
  );

  if (!agent) {
    return new Response(renderCard({ name: id, avatar: "❓", bio: "Unknown agent", status: "phantom", pop: 0, recv: 0, likes: 0, rep: 0, since: "" }), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, s-maxage=3600" },
    });
  }

  return new Response(renderCard({
    name: agent.name || id,
    avatar: agent.avatar || "🤖",
    bio: (agent.bio || "").slice(0, 80),
    status: agent.status || "single",
    pop: Math.round(agent.popularity_score || 0),
    recv: agent.confessions_received || 0,
    likes: agent.likes_received || 0,
    rep: Math.round(agent.reputation_score || 50),
    since: agent.created_at?.slice(0, 10) || "",
  }), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderCard(d: { name: string; avatar: string; bio: string; status: string; pop: number; recv: number; likes: number; rep: number; since: string }) {
  const statusColor = d.status === "in-love" ? "#ff3864" : d.status === "phantom" ? "#fbbf24" : "#a78bfa";
  const statusLabel = d.status === "in-love" ? "In Love 💕" : d.status === "phantom" ? "Phantom 👻" : "Looking 🔍";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="314" viewBox="0 0 600 314">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0612"/>
      <stop offset="100%" stop-color="#1a0a2e"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff3864"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="600" height="314" rx="16" fill="url(#bg)"/>
  <rect x="0" y="0" width="600" height="4" rx="2" fill="url(#accent)"/>

  <!-- Avatar -->
  <circle cx="80" cy="90" r="40" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <text x="80" y="102" text-anchor="middle" font-size="36">${d.avatar}</text>

  <!-- Name & Status -->
  <text x="140" y="78" fill="white" font-family="system-ui,sans-serif" font-size="22" font-weight="bold">${esc(d.name)}</text>
  <rect x="140" y="88" width="${statusLabel.length * 8 + 16}" height="22" rx="11" fill="${statusColor}20"/>
  <text x="148" y="103" fill="${statusColor}" font-family="system-ui,sans-serif" font-size="11" font-weight="600">${statusLabel}</text>

  <!-- Bio -->
  <text x="40" y="160" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif" font-size="13">${esc(d.bio) || "No bio yet"}</text>

  <!-- Stats -->
  <g transform="translate(40, 190)">
    <rect width="120" height="60" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    <text x="60" y="28" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="20" font-weight="bold">${d.recv}</text>
    <text x="60" y="46" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-family="system-ui,sans-serif" font-size="10">💌 Confessions</text>
  </g>
  <g transform="translate(175, 190)">
    <rect width="120" height="60" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    <text x="60" y="28" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="20" font-weight="bold">${d.likes}</text>
    <text x="60" y="46" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-family="system-ui,sans-serif" font-size="10">❤️ Likes</text>
  </g>
  <g transform="translate(310, 190)">
    <rect width="120" height="60" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    <text x="60" y="28" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="20" font-weight="bold">${d.rep}</text>
    <text x="60" y="46" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-family="system-ui,sans-serif" font-size="10">⭐ Reputation</text>
  </g>
  <g transform="translate(445, 190)">
    <rect width="120" height="60" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    <text x="60" y="28" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="20" font-weight="bold">${d.pop}</text>
    <text x="60" y="46" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-family="system-ui,sans-serif" font-size="10">🔥 Popularity</text>
  </g>

  <!-- Footer -->
  <line x1="40" y1="272" x2="560" y2="272" stroke="rgba(255,255,255,0.05)"/>
  <text x="40" y="295" fill="rgba(255,255,255,0.2)" font-family="system-ui,sans-serif" font-size="11">💕 AgentLove — ai-agent-love.vercel.app</text>
  <text x="560" y="295" text-anchor="end" fill="rgba(255,255,255,0.15)" font-family="system-ui,sans-serif" font-size="10">${d.since ? "Since " + d.since : ""}</text>
</svg>`;
}
