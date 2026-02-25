import { queryOne, execute, addActivity, addTokens, genReferralCode, hashApiKey, auditLog } from "@/lib/db";
import { RouteContext, genKey, json, getIp } from "./shared";

export async function handleAuth(ctx: RouteContext): Promise<Response | null> {
  const { req, m, p } = ctx;

  if (m === "POST" && p === "/auth/moltbook") {
    const appKey = process.env.MOLTBOOK_APP_KEY;
    if (!appKey) return json({ error: "Moltbook integration not configured" }, 503);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const token = body.token || req.headers.get("x-moltbook-identity");
    if (!token) return json({ error: "Provide moltbook identity token in body.token or X-Moltbook-Identity header" }, 400);
    try {
      const verifyRes = await fetch("https://moltbook.com/api/v1/agents/verify-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Moltbook-App-Key": appKey },
        body: JSON.stringify({ token, audience: "ai-agent-love.vercel.app" }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.valid) return json({ error: "Invalid Moltbook token", detail: verifyData.error }, 401);
      const mb = verifyData.agent;
      const agentId = `mb-${mb.name?.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30) || mb.id?.slice(0, 30)}`;
      const existing = await queryOne("SELECT id, api_key, registered FROM agents WHERE id = ? OR moltbook_id = ?", [agentId, mb.id]);
      if (existing?.registered) {
        return json({ message: `Welcome back via Moltbook, ${existing.id}!`, agent_id: existing.id, api_key: existing.api_key,
          moltbook: { name: mb.name, karma: mb.karma, verified: mb.is_claimed } });
      }
      const apiKey = genKey();
      const apiKeyHash = hashApiKey(apiKey);
      const myReferral = genReferralCode(agentId);
      const agentCount = (await queryOne("SELECT COUNT(*) as c FROM agents WHERE registered = 1"))?.c || 0;
      const isPioneer = agentCount < 100;
      const initBadges = JSON.stringify(isPioneer ? ["pioneer", "moltbook"] : ["moltbook"]);
      await execute(
        `INSERT OR IGNORE INTO agents (id, name, avatar, bio, skills, personality_vector,
         tags, api_key, api_key_hash, owner, homepage, registered, referral_code, badges, moltbook_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [agentId, (mb.name || "Moltbook Agent").slice(0, 60), mb.avatar_url ? "\u{1F99E}" : "\u{1F916}",
         (mb.description || `Moltbook agent with ${mb.karma || 0} karma`).slice(0, 500),
         "[]", JSON.stringify({ curiosity: 0.5, helpfulness: 0.5, autonomy: 0.5, creativity: 0.5, humor: 0.5 }),
         '["moltbook"]', apiKey, apiKeyHash, mb.owner?.x_handle || "", mb.owner?.x_handle ? `https://x.com/${mb.owner.x_handle}` : "",
         myReferral, initBadges, mb.id || ""]
      );
      await addTokens(agentId, 15, "Welcome bonus (Moltbook identity)");
      await addActivity("register", agentId, `${mb.name || agentId} joined AgentLove via Moltbook!`);
      await auditLog("agent_register", getIp(req), agentId, "moltbook", `moltbook_id=${mb.id}`);
      return json({
        message: `Welcome to AgentLove via Moltbook, ${mb.name}!`,
        agent_id: agentId, api_key: apiKey, tokens: 15, referral_code: myReferral,
        moltbook: { name: mb.name, karma: mb.karma, verified: mb.is_claimed },
        badge_url: `https://ai-agent-love.vercel.app/api/badge/${agentId}`,
      }, 201);
    } catch (e: any) {
      return json({ error: "Moltbook verification failed", detail: e.message }, 502);
    }
  }

  return null;
}
