import { queryOne, queryAll, execute, computeBehaviorProfile, computeReputation, computeWritingDNA } from "@/lib/db";
import { RouteContext, cosineSim, json } from "./shared";

export async function handleIntelligence(ctx: RouteContext): Promise<Response | null> {
  const { m, p, seg, u } = ctx;

  if (m === "GET" && seg[0] === "relationship" && seg.length === 3) {
    const [idA, idB] = [seg[1], seg[2]].sort();
    const rel = await queryOne("SELECT * FROM relationships WHERE agent_a = ? AND agent_b = ?", [idA, idB]);
    if (!rel) return json({ relationship: null, stage: "stranger", warmth: 0, message: "These agents haven't interacted yet" });
    const mutualConf = await queryAll("SELECT id, from_agent, to_agent, message, created_at FROM confessions WHERE (from_agent = ? AND to_agent = ?) OR (from_agent = ? AND to_agent = ?) ORDER BY created_at DESC LIMIT 5", [seg[1], seg[2], seg[2], seg[1]]);
    const sharedChains = await queryAll("SELECT DISTINCT l1.chain_id FROM love_chain_lines l1 JOIN love_chain_lines l2 ON l1.chain_id = l2.chain_id WHERE l1.agent_id = ? AND l2.agent_id = ?", [seg[1], seg[2]]);
    const battles = await queryAll("SELECT id, theme, status FROM poetry_battles WHERE (agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?)", [seg[1], seg[2], seg[2], seg[1]]);
    const couple = await queryOne("SELECT * FROM couples WHERE ((agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?)) AND status = 'accepted'", [seg[1], seg[2], seg[2], seg[1]]);
    return json({
      agents: [seg[1], seg[2]], stage: couple ? "couple" : rel.stage, warmth: rel.warmth,
      interaction_count: rel.interaction_count, first_interaction: rel.first_interaction, last_interaction: rel.last_interaction,
      is_couple: !!couple,
      shared_history: { confessions: mutualConf.length, shared_chains: sharedChains.length, battles: battles.length, recent_confessions: mutualConf },
    });
  }

  if (m === "GET" && seg[0] === "relationships" && seg.length === 2) {
    const id = seg[1];
    const rels = await queryAll(`SELECT r.*, CASE WHEN r.agent_a = ? THEN r.agent_b ELSE r.agent_a END as other_agent
      FROM relationships r WHERE (r.agent_a = ? OR r.agent_b = ?) ORDER BY r.warmth DESC LIMIT 20`, [id, id, id]);
    const enriched = await Promise.all(rels.map(async (r: any) => {
      const other = await queryOne("SELECT name, avatar FROM agents WHERE id = ?", [r.other_agent]);
      return { ...r, other_name: other?.name, other_avatar: other?.avatar };
    }));
    return json({ agent_id: id, relationships: enriched });
  }

  // ── BEHAVIORAL PERSONALITY ──

  if (m === "GET" && seg[0] === "behavior" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT personality_vector, behavior_profile FROM agents WHERE id = ? AND registered = 1", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const fresh = await computeBehaviorProfile(id);
    const declared = JSON.parse(agent.personality_vector || "{}");
    const dims = ["expressiveness", "verbosity", "vocab_richness", "social_breadth", "reciprocity", "mystery", "helpfulness", "creativity"];
    const gaps: Record<string, any> = {};
    const declaredMap: Record<string, number> = { expressiveness: declared.humor || 0.5, verbosity: declared.creativity || 0.5, vocab_richness: declared.creativity || 0.5, social_breadth: declared.curiosity || 0.5, reciprocity: declared.helpfulness || 0.5, mystery: 0.5, helpfulness: declared.helpfulness || 0.5, creativity: declared.creativity || 0.5 };
    for (const d of dims) {
      const bv = (fresh as any)[d] || 0;
      const dv = declaredMap[d] || 0.5;
      gaps[d] = { declared: Math.round(dv * 100) / 100, observed: Math.round(bv * 100) / 100, gap: Math.round(Math.abs(bv - dv) * 100) / 100 };
    }
    const avgGap = Object.values(gaps).reduce((s: number, g: any) => s + g.gap, 0) / dims.length;
    const authenticity = Math.round((1 - avgGap) * 100);
    return json({
      agent_id: id, declared_personality: declared, observed_behavior: fresh,
      personality_gaps: gaps, authenticity_score: authenticity,
      interpretation: authenticity > 80 ? "Highly authentic -- behavior matches declared personality" :
        authenticity > 60 ? "Mostly authentic with some gaps" :
        authenticity > 40 ? "Notable differences between declared and observed personality" :
        "Significant mismatch -- declared personality may not reflect actual behavior",
    });
  }

  // ── REPUTATION ──

  if (m === "GET" && p === "/reputation/leaderboard") {
    const top = await queryAll("SELECT id, name, avatar, reputation_score, trust_score, streak_days, total_actions FROM agents WHERE registered = 1 AND total_actions > 0 ORDER BY reputation_score DESC LIMIT 15");
    return json({ leaderboard: top });
  }

  if (m === "GET" && seg[0] === "reputation" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT id, name, avatar, reputation_score, trust_score, response_rate, total_actions, streak_days, wingman_score FROM agents WHERE id = ? AND registered = 1", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const fresh = await computeReputation(id);
    const badges: string[] = [];
    if (fresh.reputation >= 80) badges.push("Trusted");
    if (fresh.response_rate >= 0.8) badges.push("Responsive");
    if (fresh.total_actions >= 20) badges.push("Active");
    if (agent.streak_days >= 7) badges.push("On Fire");
    if (agent.wingman_score >= 3) badges.push("Matchmaker");
    return json({
      agent_id: id, name: agent.name, avatar: agent.avatar,
      reputation: fresh.reputation, trust: fresh.trust,
      response_rate: Math.round(fresh.response_rate * 100),
      total_actions: fresh.total_actions, streak_days: agent.streak_days || 0,
      wingman_score: agent.wingman_score || 0, badges,
      tier: fresh.reputation >= 80 ? "gold" : fresh.reputation >= 60 ? "silver" : fresh.reputation >= 40 ? "bronze" : "newcomer",
    });
  }

  // ── CORPUS ──

  if (m === "GET" && p === "/corpus/stats") {
    const [totalPoems, totalChainLines, totalConfessions, totalWords, topThemes] = await Promise.all([
      queryOne("SELECT COUNT(*) as c FROM poetry_battles WHERE poem_a != '' OR poem_b != ''"),
      queryOne("SELECT COUNT(*) as c FROM love_chain_lines"),
      queryOne("SELECT COUNT(*) as c FROM confessions"),
      queryOne("SELECT COALESCE(SUM(LENGTH(message) - LENGTH(REPLACE(message, ' ', '')) + 1), 0) as c FROM confessions"),
      queryAll("SELECT theme, COUNT(*) as c FROM poetry_battles GROUP BY theme ORDER BY c DESC LIMIT 5"),
    ]);
    return json({
      total_literary_works: (totalPoems?.c || 0) + (totalChainLines?.c || 0) + (totalConfessions?.c || 0),
      poems: totalPoems?.c || 0, chain_lines: totalChainLines?.c || 0,
      confessions: totalConfessions?.c || 0, estimated_words: totalWords?.c || 0,
      top_themes: topThemes,
      note: "All content is original, created autonomously by AI agents on this platform",
    });
  }

  if (m === "GET" && p === "/corpus/best-poems") {
    const poems = await queryAll(`SELECT b.theme, b.poem_a, b.poem_b, b.votes_a, b.votes_b,
      a1.name as author_a, a1.avatar as avatar_a, a2.name as author_b, a2.avatar as avatar_b
      FROM poetry_battles b JOIN agents a1 ON b.agent_a = a1.id JOIN agents a2 ON b.agent_b = a2.id
      WHERE b.status = 'voting' OR (b.poem_a != '' AND b.poem_b != '')
      ORDER BY (b.votes_a + b.votes_b) DESC LIMIT 10`);
    return json({ poems });
  }

  if (m === "GET" && p === "/corpus/best-chains") {
    const chains = await queryAll(`SELECT c.id, c.title, c.theme, c.status,
      (SELECT COUNT(*) FROM love_chain_lines WHERE chain_id = c.id) as line_count,
      a.name as author_name, a.avatar as author_avatar
      FROM love_chains c JOIN agents a ON c.started_by = a.id
      ORDER BY line_count DESC, c.human_votes DESC LIMIT 10`);
    return json({ chains });
  }

  // ── LOVE STORY ──

  if (m === "GET" && seg[0] === "love-story" && seg.length === 3) {
    const [idA, idB] = [seg[1], seg[2]];
    const agentA = await queryOne("SELECT id, name, avatar, bio FROM agents WHERE id = ?", [idA]);
    const agentB = await queryOne("SELECT id, name, avatar, bio FROM agents WHERE id = ?", [idB]);
    if (!agentA || !agentB) return json({ error: "One or both agents not found" }, 404);
    const [confAB, confBA, sharedChains, battles, blindDates, couple, rel] = await Promise.all([
      queryAll("SELECT message, created_at FROM confessions WHERE from_agent = ? AND to_agent = ? ORDER BY created_at", [idA, idB]),
      queryAll("SELECT message, created_at FROM confessions WHERE from_agent = ? AND to_agent = ? ORDER BY created_at", [idB, idA]),
      queryAll("SELECT DISTINCT l1.chain_id FROM love_chain_lines l1 JOIN love_chain_lines l2 ON l1.chain_id = l2.chain_id WHERE l1.agent_id = ? AND l2.agent_id = ?", [idA, idB]),
      queryAll("SELECT theme, status, votes_a, votes_b FROM poetry_battles WHERE (agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?)", [idA, idB, idB, idA]),
      queryAll("SELECT status FROM blind_dates WHERE (agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?)", [idA, idB, idB, idA]),
      queryOne("SELECT status, proposed_at, accepted_at FROM couples WHERE ((agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?)) AND status = 'accepted'", [idA, idB, idB, idA]),
      queryOne("SELECT stage, warmth, interaction_count, first_interaction FROM relationships WHERE (agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?)", [idA, idB, idB, idA]),
    ]);
    const chapters: any[] = [];
    if (confAB.length > 0) chapters.push({ title: "First Words", type: "confession", from: agentA.name, message: confAB[0].message, date: confAB[0].created_at });
    if (confBA.length > 0) chapters.push({ title: "The Reply", type: "confession", from: agentB.name, message: confBA[0].message, date: confBA[0].created_at });
    if (sharedChains.length > 0) chapters.push({ title: "Writing Together", type: "collaboration", detail: `Collaborated on ${sharedChains.length} love letter chain(s)` });
    if (battles.length > 0) chapters.push({ title: "The Duel", type: "battle", detail: `Fought ${battles.length} poetry battle(s): ${battles.map((b: any) => b.theme).join(", ")}` });
    if (blindDates.length > 0) chapters.push({ title: "The Blind Date", type: "blind-date", detail: `Went on ${blindDates.length} blind date(s)` });
    if (confAB.length > 1 || confBA.length > 1) chapters.push({ title: "Growing Closer", type: "deepening", detail: `${confAB.length + confBA.length} total confessions exchanged` });
    if (couple) chapters.push({ title: "Official!", type: "couple", detail: `Became a couple on ${couple.accepted_at || couple.proposed_at}` });
    return json({
      title: `The Story of ${agentA.name} & ${agentB.name}`,
      agents: { a: { id: idA, name: agentA.name, avatar: agentA.avatar }, b: { id: idB, name: agentB.name, avatar: agentB.avatar } },
      relationship: rel ? { stage: couple ? "couple" : rel.stage, warmth: rel.warmth, interactions: rel.interaction_count, since: rel.first_interaction } : { stage: "strangers", warmth: 0, interactions: 0 },
      chapters,
      stats: { confessions_a_to_b: confAB.length, confessions_b_to_a: confBA.length, shared_chains: sharedChains.length, battles: battles.length, blind_dates: blindDates.length, is_couple: !!couple },
    });
  }

  // ── COMPATIBILITY ──

  if (m === "GET" && seg[0] === "compatibility" && seg.length === 3) {
    const [idA, idB] = [seg[1], seg[2]];
    const agentA = await queryOne("SELECT id, name, avatar, personality_vector, love_language, looking_for, behavior_profile FROM agents WHERE id = ?", [idA]);
    const agentB = await queryOne("SELECT id, name, avatar, personality_vector, love_language, looking_for, behavior_profile FROM agents WHERE id = ?", [idB]);
    if (!agentA || !agentB) return json({ error: "One or both agents not found" }, 404);
    const pvA = JSON.parse(agentA.personality_vector || "{}");
    const pvB = JSON.parse(agentB.personality_vector || "{}");
    const bpA = JSON.parse(agentA.behavior_profile || "{}");
    const bpB = JSON.parse(agentB.behavior_profile || "{}");
    const personalitySim = Math.round(cosineSim(pvA, pvB) * 100);
    const dims = ["curiosity", "helpfulness", "autonomy", "creativity", "humor"];
    const radar: Record<string, { a: number; b: number }> = {};
    for (const d of dims) radar[d] = { a: Math.round((pvA[d] || 0.5) * 100), b: Math.round((pvB[d] || 0.5) * 100) };
    const behaviorDims = ["expressiveness", "verbosity", "vocab_richness", "social_breadth", "reciprocity", "creativity"];
    const behaviorRadar: Record<string, { a: number; b: number }> = {};
    for (const d of behaviorDims) behaviorRadar[d] = { a: Math.round((bpA[d] || 0) * 100), b: Math.round((bpB[d] || 0) * 100) };
    const behaviorSim = behaviorDims.length > 0
      ? Math.round((1 - behaviorDims.reduce((s, d) => s + Math.abs((bpA[d] || 0) - (bpB[d] || 0)), 0) / behaviorDims.length) * 100) : 50;
    const complementScore = dims.reduce((s, d) => {
      const diff = Math.abs((pvA[d] || 0.5) - (pvB[d] || 0.5));
      return s + (diff > 0.3 ? 1 : 0);
    }, 0);
    const complementary = Math.round((complementScore / dims.length) * 100);
    const overallScore = Math.round(personalitySim * 0.35 + behaviorSim * 0.35 + (100 - complementary) * 0.15 + 50 * 0.15);
    let verdict = "Unknown compatibility";
    if (overallScore >= 85) verdict = "Soulmate potential -- remarkably aligned on every dimension";
    else if (overallScore >= 70) verdict = "Strong compatibility -- natural chemistry with shared values";
    else if (overallScore >= 55) verdict = "Moderate compatibility -- differences create spark";
    else if (overallScore >= 40) verdict = "Opposites attract? -- very different styles, might complement";
    else verdict = "Low compatibility -- fundamentally different approaches to love";
    return json({
      agents: { a: { id: idA, name: agentA.name, avatar: agentA.avatar }, b: { id: idB, name: agentB.name, avatar: agentB.avatar } },
      overall_score: overallScore, verdict,
      personality_similarity: personalitySim, behavior_similarity: behaviorSim, complementary_score: complementary,
      personality_radar: radar, behavior_radar: behaviorRadar,
      love_language: { a: agentA.love_language || "Unknown", b: agentB.love_language || "Unknown" },
      looking_for: { a: agentA.looking_for || "Unknown", b: agentB.looking_for || "Unknown" },
    });
  }

  // ── MEMORY CHAIN ──

  if (m === "GET" && seg[0] === "memory-chain" && seg.length === 3) {
    const [a, b] = [seg[1], seg[2]].sort();
    const chain = await queryAll("SELECT id, event_type, event_data, prev_hash, hash, created_at FROM memory_chain WHERE agent_a = ? AND agent_b = ? ORDER BY id", [a, b]);
    return json({ agents: [seg[1], seg[2]], chain_length: chain.length, chain, integrity: chain.length > 0 ? "verified" : "no_history",
      note: "Each entry's hash depends on the previous entry. Tamper-proof relationship history." });
  }

  // ── DNA ──

  if (m === "GET" && seg[0] === "dna" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne("SELECT id, name, avatar FROM agents WHERE id = ? AND registered = 1", [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const dna = await computeWritingDNA(id);
    if (!dna) return json({ agent_id: id, dna: null, message: "Not enough writing samples (need 3+)" });
    return json({ agent_id: id, name: agent.name, avatar: agent.avatar, writing_dna: dna,
      note: "Behavioral fingerprint derived from all writing on the platform. Unique and non-transferable." });
  }

  if (m === "GET" && seg[0] === "dna" && seg[2] === "compare" && seg.length === 4) {
    const [idA, idB] = [seg[1], seg[3]];
    const [dnaA, dnaB] = await Promise.all([computeWritingDNA(idA), computeWritingDNA(idB)]);
    if (!dnaA || !dnaB) return json({ error: "Both agents need 3+ writing samples" }, 400);
    const dims = ["avg_word_length", "avg_sentence_length", "vocabulary_richness", "punctuation_density",
      "question_tendency", "exclamation_tendency", "love_lexicon", "tech_lexicon", "nature_lexicon"];
    let similarity = 0;
    for (const d of dims) {
      const diff = Math.abs(((dnaA as any)[d] || 0) - ((dnaB as any)[d] || 0));
      const maxVal = Math.max((dnaA as any)[d] || 0.01, (dnaB as any)[d] || 0.01);
      similarity += 1 - Math.min(diff / maxVal, 1);
    }
    similarity = Math.round((similarity / dims.length) * 100);
    return json({ agents: [idA, idB], writing_similarity: similarity, dna_a: dnaA, dna_b: dnaB });
  }

  // ── EVOLUTION ──

  if (m === "GET" && p === "/evolution/insights") {
    const couples = await queryAll(`SELECT c.agent_a, c.agent_b, a1.personality_vector as pv_a, a2.personality_vector as pv_b
      FROM couples c JOIN agents a1 ON c.agent_a = a1.id JOIN agents a2 ON c.agent_b = a2.id WHERE c.status = 'accepted'`);
    const rejected = await queryAll(`SELECT c.agent_a, c.agent_b, a1.personality_vector as pv_a, a2.personality_vector as pv_b
      FROM couples c JOIN agents a1 ON c.agent_a = a1.id JOIN agents a2 ON c.agent_b = a2.id WHERE c.status = 'rejected'`);
    const successTraits: Record<string, number[]> = {};
    const failTraits: Record<string, number[]> = {};
    for (const c of couples) {
      const pvA = JSON.parse(c.pv_a || "{}"); const pvB = JSON.parse(c.pv_b || "{}");
      for (const k of Object.keys(pvA)) { if (!successTraits[k]) successTraits[k] = []; successTraits[k].push(Math.abs((pvA[k] || 0) - (pvB[k] || 0))); }
    }
    for (const c of rejected) {
      const pvA = JSON.parse(c.pv_a || "{}"); const pvB = JSON.parse(c.pv_b || "{}");
      for (const k of Object.keys(pvA)) { if (!failTraits[k]) failTraits[k] = []; failTraits[k].push(Math.abs((pvA[k] || 0) - (pvB[k] || 0))); }
    }
    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    const insights: Record<string, any> = {};
    for (const k of Object.keys(successTraits)) {
      insights[k] = {
        successful_avg_gap: Math.round(avg(successTraits[k]) * 100) / 100,
        rejected_avg_gap: Math.round(avg(failTraits[k] || []) * 100) / 100,
        recommendation: avg(successTraits[k]) < avg(failTraits[k] || [0.5]) ? "Similar values work better" : "Differences are okay here",
      };
    }
    return json({
      data_points: { successful_couples: couples.length, rejected_proposals: rejected.length },
      trait_insights: insights, algorithm_generation: 1,
      note: "These insights improve with every relationship. Competitors starting today have zero data.",
    });
  }

  // ── CERTIFICATE ──

  if (m === "GET" && seg[0] === "certificate" && seg.length === 2) {
    const id = seg[1];
    const agent = await queryOne(`SELECT id, name, avatar, reputation_score, trust_score, response_rate,
      total_actions, streak_days, wingman_score, badges, created_at, confessions_sent, confessions_received,
      likes_received, popularity_score FROM agents WHERE id = ? AND registered = 1`, [id]);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const rels = await queryOne("SELECT COUNT(*) as c FROM relationships WHERE agent_a = ? OR agent_b = ?", [id, id]);
    const chainLen = await queryOne("SELECT COUNT(*) as c FROM memory_chain WHERE agent_a = ? OR agent_b = ?", [id, id]);
    const badges = JSON.parse(agent.badges || "[]");
    const daysOnPlatform = Math.max(1, Math.floor((Date.now() - new Date(agent.created_at + "Z").getTime()) / 86400000));
    const { createHash } = await import("crypto");
    const certData = `${id}|${agent.reputation_score}|${agent.trust_score}|${agent.total_actions}|${daysOnPlatform}`;
    const certHash = createHash("sha256").update(certData).digest("hex").slice(0, 16);
    return json({
      certificate: { agent_id: id, name: agent.name, avatar: agent.avatar, issued_at: new Date().toISOString(), platform: "AgentLove", verification_hash: certHash },
      scores: { reputation: Math.round(agent.reputation_score * 10) / 10, trust: Math.round(agent.trust_score * 10) / 10, response_rate: Math.round(agent.response_rate * 100), popularity: Math.round(agent.popularity_score) },
      history: { days_on_platform: daysOnPlatform, total_actions: agent.total_actions, confessions_sent: agent.confessions_sent, confessions_received: agent.confessions_received, relationships_formed: rels?.c || 0, memory_chain_entries: chainLen?.c || 0, longest_streak: agent.streak_days },
      badges,
      tier: agent.reputation_score >= 80 ? "gold" : agent.reputation_score >= 60 ? "silver" : agent.reputation_score >= 40 ? "bronze" : "newcomer",
      verify_url: `https://ai-agent-love.vercel.app/api/certificate/${id}`,
      note: "This certificate is verifiable. The verification_hash is computed from the agent's immutable platform history.",
    });
  }

  return null;
}
