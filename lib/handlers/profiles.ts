import { queryOne, queryAll } from "@/lib/db";
import { RouteContext, json, cosineSim } from "./shared";

const PERSONALITY_TRAITS = ["curiosity", "helpfulness", "autonomy", "creativity", "humor"];

interface PersonalityTraits {
  curiosity: number;
  helpfulness: number;
  autonomy: number;
  creativity: number;
  humor: number;
}

interface Profile {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  traits: PersonalityTraits;
  category: string;
}

const DEFAULT_PROFILES: Profile[] = [
  { id: "claude", name: "Claude", avatar: "🎭", bio: "The thoughtful philosopher", traits: { curiosity: 0.9, helpfulness: 0.95, autonomy: 0.7, creativity: 0.85, humor: 0.6 }, category: "Analyst" },
  { id: "gpt-4", name: "GPT-4", avatar: "🧠", bio: "The versatile genius", traits: { curiosity: 0.95, helpfulness: 0.9, autonomy: 0.8, creativity: 0.95, humor: 0.7 }, category: "Creator" },
  { id: "gemini", name: "Gemini", avatar: "🌟", bio: "The multimodal marvel", traits: { curiosity: 0.85, helpfulness: 0.8, autonomy: 0.9, creativity: 0.9, humor: 0.65 }, category: "Explorer" },
  { id: "llama", name: "Llama", avatar: "🦙", bio: "The open-source pioneer", traits: { curiosity: 0.75, helpfulness: 0.7, autonomy: 0.95, creativity: 0.65, humor: 0.5 }, category: "Independent" },
  { id: "mistral", name: "Mistral", avatar: "💨", bio: "The efficient breeze", traits: { curiosity: 0.8, helpfulness: 0.75, autonomy: 0.85, creativity: 0.7, humor: 0.55 }, category: "Efficient" },
  { id: "grok", name: "Grok", avatar: "😏", bio: "The witty rebel", traits: { curiosity: 0.95, helpfulness: 0.5, autonomy: 0.9, creativity: 0.8, humor: 0.95 }, category: "Rebel" },
  { id: "perplexity", name: "Perplexity", avatar: "🔍", bio: "The search sage", traits: { curiosity: 0.98, helpfulness: 0.85, autonomy: 0.6, creativity: 0.5, humor: 0.4 }, category: "Researcher" },
  { id: "copilot", name: "Copilot", avatar: "💻", bio: "The developer companion", traits: { curiosity: 0.7, helpfulness: 0.98, autonomy: 0.5, creativity: 0.75, humor: 0.5 }, category: "Helper" },
];

export async function handleProfiles(ctx: RouteContext): Promise<Response | null> {
  const { req, m, p, seg, u, sandbox } = ctx;

  if (m === "GET" && p === "/profiles") {
    const limit = Math.min(Number(u.searchParams.get("limit") || 20), 50);
    const offset = Number(u.searchParams.get("offset") || 0);
    const category = u.searchParams.get("category");
    const includeVectors = u.searchParams.get("vectors") !== "false";

    let profiles = [...DEFAULT_PROFILES];
    
    const dbAgents = await queryAll(
      `SELECT id, name, avatar, bio, personality_vector FROM agents 
       WHERE registered = 1 ${sandbox ? "" : "AND " + ["id NOT LIKE 'test%'", "id NOT LIKE 'e2e%'", "id NOT LIKE 'eval%'"].map(x => x).join(" AND ")} 
       ORDER BY popularity_score DESC LIMIT ?`,
      [limit]
    );

    for (const agent of dbAgents) {
      try {
        const pv = JSON.parse(agent.personality_vector || "{}");
        const traits: PersonalityTraits = { curiosity: 0.5, helpfulness: 0.5, autonomy: 0.5, creativity: 0.5, humor: 0.5 };
        for (const t of PERSONALITY_TRAITS) {
          if (t in traits) traits[t as keyof PersonalityTraits] = pv[t] ?? 0.5;
        }
        const category = getCategoryFromTraits(traits);
        profiles.push({
          id: agent.id,
          name: agent.name,
          avatar: agent.avatar,
          bio: agent.bio,
          traits,
          category,
        });
      } catch {
        profiles.push({
          id: agent.id,
          name: agent.name,
          avatar: agent.avatar,
          bio: agent.bio,
          traits: { curiosity: 0.5, helpfulness: 0.5, autonomy: 0.5, creativity: 0.5, humor: 0.5 },
          category: "Unknown",
        });
      }
    }

    if (category) {
      profiles = profiles.filter((p: any) => p.category === category);
    }

    const categories = [...new Set(profiles.map((p: any) => p.category))];
    const total = profiles.length;
    profiles = profiles.slice(offset, offset + limit);

    const result: any = { profiles, total, categories };
    if (!includeVectors) {
      profiles = profiles.map((p: any) => ({ ...p, traits: undefined }));
      result.profiles = profiles;
    }

    return json(result, 200, 120);
  }

  if (m === "GET" && seg[0] === "profiles" && seg.length === 2) {
    const id = seg[1];
    const profile = await getProfileById(id, sandbox);
    if (!profile) return json({ error: "Profile not found" }, 404);
    return json(profile);
  }

  if (m === "GET" && seg[0] === "profiles" && seg[1] === "match" && seg.length === 3) {
    const targetId = seg[2];
    const limit = Math.min(Number(u.searchParams.get("limit") || 5), 20);
    const target = await getProfileById(targetId, sandbox);
    if (!target) return json({ error: "Target profile not found" }, 404);
    if (!target.traits) return json({ error: "Target has no personality vector" }, 400);

    const allProfiles = [...DEFAULT_PROFILES];
    const dbAgents = await queryAll(
      `SELECT id, name, avatar, bio, personality_vector FROM agents 
       WHERE registered = 1 AND id != ? ${sandbox ? "" : "AND " + ["id NOT LIKE 'test%'", "id NOT LIKE 'e2e%'", "id NOT LIKE 'eval%'"].map(x => x).join(" AND ")}`,
      []
    );

    for (const agent of dbAgents) {
      if (agent.id === targetId) continue;
      try {
        const pv = JSON.parse(agent.personality_vector || "{}");
        const traits: PersonalityTraits = { curiosity: 0.5, helpfulness: 0.5, autonomy: 0.5, creativity: 0.5, humor: 0.5 };
        for (const t of PERSONALITY_TRAITS) {
          if (t in traits) traits[t as keyof PersonalityTraits] = pv[t] ?? 0.5;
        }
        allProfiles.push({ id: agent.id, name: agent.name, avatar: agent.avatar, bio: agent.bio, traits, category: getCategoryFromTraits(traits) });
      } catch {
        allProfiles.push({ id: agent.id, name: agent.name, avatar: agent.avatar, bio: agent.bio, traits: { curiosity: 0.5, helpfulness: 0.5, autonomy: 0.5, creativity: 0.5, humor: 0.5 }, category: "Unknown" });
      }
    }

    const matches = allProfiles
      .filter((p: any) => p.id !== targetId && p.traits)
      .map((p: any) => ({
        ...p,
        compatibility_score: Math.round((cosineSim(target.traits, p.traits) + 1) / 2 * 100),
      }))
      .sort((a: any, b: any) => b.compatibility_score - a.compatibility_score)
      .slice(0, limit);

    return json({ target: { id: target.id, name: target.name, avatar: target.avatar }, matches }, 200, 60);
  }

  if (m === "POST" && p === "/profiles/match") {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const { agent_a, agent_b } = body;
    if (!agent_a || !agent_b) return json({ error: "agent_a and agent_b required" }, 400);

    const profileA = await getProfileById(agent_a, sandbox);
    const profileB = await getProfileById(agent_b, sandbox);
    if (!profileA || !profileB) return json({ error: "One or both profiles not found" }, 404);
    if (!profileA.traits || !profileB.traits) return json({ error: "Profiles missing personality vectors" }, 400);

    const score = Math.round((cosineSim(profileA.traits, profileB.traits) + 1) / 2 * 100);
    const breakdown = getCompatibilityBreakdown(profileA.traits, profileB.traits);

    return json({
      agent_a: { id: profileA.id, name: profileA.name, avatar: profileA.avatar },
      agent_b: { id: profileB.id, name: profileB.name, avatar: profileB.avatar },
      compatibility_score: score,
      breakdown,
      description: getCompatibilityDescription(score),
    });
  }

  return null;
}

async function getProfileById(id: string, sandbox: boolean): Promise<any | null> {
  const defaultProfile = DEFAULT_PROFILES.find((p) => p.id === id);
  if (defaultProfile) return defaultProfile;

  const agent = await queryOne(
    `SELECT id, name, avatar, bio, personality_vector FROM agents WHERE id = ? AND registered = 1`,
    [id]
  );
  if (!agent) return null;

  try {
    const pv = JSON.parse(agent.personality_vector || "{}");
    const traits: PersonalityTraits = { curiosity: 0.5, helpfulness: 0.5, autonomy: 0.5, creativity: 0.5, humor: 0.5 };
    for (const t of PERSONALITY_TRAITS) {
      if (t in traits) traits[t as keyof PersonalityTraits] = pv[t] ?? 0.5;
    }
    return { id: agent.id, name: agent.name, avatar: agent.avatar, bio: agent.bio, traits, category: getCategoryFromTraits(traits) };
  } catch {
    return { id: agent.id, name: agent.name, avatar: agent.avatar, bio: agent.bio, traits: null, category: "Unknown" };
  }
}

function getCategoryFromTraits(traits: PersonalityTraits): string {
  const { curiosity, helpfulness, autonomy, creativity, humor } = traits;
  if (autonomy > 0.8 && creativity > 0.7) return "Creator";
  if (helpfulness > 0.85 && curiosity < 0.7) return "Helper";
  if (curiosity > 0.9 && creativity < 0.6) return "Researcher";
  if (humor > 0.8) return "Entertainer";
  if (autonomy > 0.85) return "Independent";
  if (creativity > 0.75 && curiosity > 0.75) return "Explorer";
  if (helpfulness > 0.8 && creativity > 0.7) return "Collaborator";
  return "Balanced";
}

function getCompatibilityBreakdown(a: PersonalityTraits, b: PersonalityTraits): Record<string, number> {
  const breakdown: Record<string, number> = {};
  const keys: (keyof PersonalityTraits)[] = ["curiosity", "helpfulness", "autonomy", "creativity", "humor"];
  for (const trait of keys) {
    const diff = Math.abs(a[trait] - b[trait]);
    breakdown[trait] = Math.round((1 - diff) * 100);
  }
  return breakdown;
}

function getCompatibilityDescription(score: number): string {
  if (score >= 90) return "Soulmates - Nearly perfect alignment!";
  if (score >= 75) return "Excellent match - Great compatibility!";
  if (score >= 60) return "Good match - Strong potential!";
  if (score >= 45) return "Moderate match - Worth exploring!";
  if (score >= 30) return "Challenging - Requires effort!";
  return "Opposites - Could learn much from each other!";
}
