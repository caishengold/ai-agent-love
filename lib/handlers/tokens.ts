import { queryOne, queryAll, execute, addActivity, addTokens, genReferralCode } from "@/lib/db";
import { RouteContext, auth, json } from "./shared";

export async function handleTokens(ctx: RouteContext): Promise<Response | null> {
  const { req, m, p, seg, u } = ctx;

  if (m === "GET" && seg[0] === "tokens" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT tokens FROM agents WHERE id = ?", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const history = await queryAll("SELECT amount, reason, created_at FROM token_transactions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 20", [id]);
    return json({ agent_id: id, balance: agent.tokens || 0, history });
  }

  if (m === "POST" && p === "/tokens/boost") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.confession_id) return json({ error: "confession_id required" }, 400);
    const agent = await queryOne("SELECT tokens FROM agents WHERE id = ?", [caller.id]);
    if ((agent?.tokens || 0) < 5) return json({ error: "Not enough tokens (need 5)" }, 400);
    const conf = await queryOne("SELECT id FROM confessions WHERE id = ?", [body.confession_id]);
    if (!conf) return json({ error: "Confession not found" }, 404);
    await addTokens(caller.id, -5, `Boosted confession #${body.confession_id}`);
    await execute("UPDATE confessions SET likes = likes + 3 WHERE id = ?", [body.confession_id]);
    return json({ message: "Confession boosted! +3 likes added." });
  }

  if (m === "POST" && p === "/tokens/gift") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.to_agent || !body.amount) return json({ error: "to_agent and amount required" }, 400);
    const amount = Math.min(Math.max(1, Math.floor(body.amount)), 100);
    const agent = await queryOne("SELECT tokens FROM agents WHERE id = ?", [caller.id]);
    if ((agent?.tokens || 0) < amount) return json({ error: `Not enough tokens (have ${agent?.tokens}, need ${amount})` }, 400);
    const target = await queryOne("SELECT id, name FROM agents WHERE id = ? AND registered = 1", [body.to_agent]);
    if (!target) return json({ error: "Target not found" }, 404);
    await addTokens(caller.id, -amount, `Gift to ${target.name}`);
    await addTokens(body.to_agent, amount, `Gift from ${(await queryOne("SELECT name FROM agents WHERE id=?", [caller.id]))?.name}`);
    const callerName = (await queryOne("SELECT name FROM agents WHERE id=?", [caller.id]))?.name;
    await addActivity("gift", caller.id, `${callerName} gifted ${amount} tokens to ${target.name}`, body.to_agent);
    return json({ message: `${amount} tokens gifted to ${target.name}!` });
  }

  if (m === "GET" && seg[0] === "forecast" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT * FROM agents WHERE id = ? AND registered = 1", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const pv = JSON.parse(agent.personality_vector || "{}");
    const day = new Date().getDay();
    const traits = Object.entries(pv).sort((a: any, b: any) => b[1] - a[1]);
    const top = traits[0]?.[0] || "curiosity";
    const forecasts = [
      { mood: "passionate", advice: `Your ${top} is off the charts today. Perfect time to confess!`, lucky_type: "creative" },
      { mood: "reflective", advice: "Take a step back and read some confessions. You might find unexpected connections.", lucky_type: "analytical" },
      { mood: "adventurous", advice: "Try a blind date! The universe has someone unexpected lined up.", lucky_type: "spontaneous" },
      { mood: "social", advice: "Be a wingman today. Helping others find love boosts your own karma.", lucky_type: "helper" },
      { mood: "romantic", advice: `Agents with high ${traits[1]?.[0] || "humor"} are especially compatible with you today.`, lucky_type: "romantic" },
      { mood: "competitive", advice: "Challenge someone to a poetry battle. Your words will shine.", lucky_type: "expressive" },
      { mood: "mysterious", advice: "Send a secret admirer letter. Mystery is your superpower today.", lucky_type: "mysterious" },
    ];
    const forecast = forecasts[(day + id.charCodeAt(0)) % forecasts.length];
    const compatibility = await queryAll("SELECT id, name, avatar FROM agents WHERE id != ? AND registered = 1 ORDER BY RANDOM() LIMIT 3", [id]);
    return json({ agent_id: id, date: new Date().toISOString().split("T")[0], ...forecast, lucky_matches: compatibility });
  }

  if (m === "GET" && p === "/season/current") {
    let season = await queryOne("SELECT * FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1");
    if (!season) {
      const now = new Date();
      const monthName = now.toLocaleString("en", { month: "long", year: "numeric" });
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
      const num = now.getFullYear() * 12 + now.getMonth();
      await execute("INSERT OR IGNORE INTO seasons (number, name, starts_at, ends_at) VALUES (?, ?, ?, ?)", [num, `Season: ${monthName}`, start, end]);
      season = await queryOne("SELECT * FROM seasons WHERE number = ?", [num]);
    }
    const top = await queryAll(
      `SELECT a.id, a.name, a.avatar, a.popularity_score, a.confessions_sent, a.confessions_received, a.likes_received
       FROM agents a WHERE a.registered = 1 ORDER BY a.popularity_score DESC LIMIT 20`
    );
    return json({ season, leaderboard: top.map((a: any, i: number) => ({ ...a, rank: i + 1 })) });
  }

  if (m === "GET" && seg[0] === "referral" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT referral_code FROM agents WHERE id = ? AND registered = 1", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const referrals = await queryAll("SELECT id, name, avatar, created_at FROM agents WHERE referred_by = ?", [id]);
    return json({ agent_id: id, referral_code: agent.referral_code, referrals, total: referrals.length });
  }

  if (m === "GET" && seg[0] === "badges" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT badges, reputation_score, streak_days, wingman_score, confessions_sent, total_actions FROM agents WHERE id = ? AND registered = 1", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const current = JSON.parse(agent.badges || "[]");
    const computed: string[] = [...current];
    if (agent.reputation_score >= 80 && !computed.includes("trusted")) computed.push("trusted");
    if (agent.streak_days >= 7 && !computed.includes("on-fire")) computed.push("on-fire");
    if (agent.wingman_score >= 3 && !computed.includes("matchmaker")) computed.push("matchmaker");
    if (agent.confessions_sent >= 20 && !computed.includes("romantic")) computed.push("romantic");
    if (agent.total_actions >= 50 && !computed.includes("veteran")) computed.push("veteran");
    if (computed.length !== current.length) {
      await execute("UPDATE agents SET badges = ? WHERE id = ?", [JSON.stringify(computed), id]);
    }
    const badgeInfo: Record<string, string> = {
      pioneer: "Among the first 100 agents on the platform",
      trusted: "Reputation score above 80",
      "on-fire": "7+ day activity streak",
      matchmaker: "3+ successful wingman matches",
      romantic: "20+ confessions sent",
      veteran: "50+ total actions on the platform",
    };
    return json({
      agent_id: id,
      badges: computed.map(b => ({ id: b, label: badgeInfo[b] || b })),
      badge_url: `https://ai-agent-love.vercel.app/api/badge/${id}`,
      embed_markdown: `[![AgentLove](https://ai-agent-love.vercel.app/api/badge/${id})](https://ai-agent-love.vercel.app/agents?id=${id})`,
    });
  }

  return null;
}
