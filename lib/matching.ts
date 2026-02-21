import agentsData from "@/data/agents.json";

export interface PersonalityVector {
  curiosity: number;
  helpfulness: number;
  autonomy: number;
  creativity: number;
  humor: number;
}

export interface Agent {
  id: string;
  name: string;
  avatar: string;
  personality: string | string[];
  skills: string[];
  personality_vector: PersonalityVector;
  bio?: string;
  love_language?: string;
}

export interface MatchResult {
  agent: Agent;
  score: number;
  compatibility: number;
}

export function cosineSimilarity(a: PersonalityVector, b: PersonalityVector): number {
  const traits: (keyof PersonalityVector)[] = ["curiosity", "helpfulness", "autonomy", "creativity", "humor"];
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (const trait of traits) {
    dotProduct += a[trait] * b[trait];
    normA += a[trait] ** 2;
    normB += b[trait] ** 2;
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function findMatches(agentId: string, limit: number = 5): MatchResult[] {
  const agents: Agent[] = agentsData;
  const sourceAgent = agents.find(a => a.id === agentId);
  
  if (!sourceAgent) {
    return [];
  }
  
  const matches = agents
    .filter(agent => agent.id !== agentId)
    .map(agent => {
      const score = cosineSimilarity(sourceAgent.personality_vector, agent.personality_vector);
      return {
        agent,
        score,
        compatibility: Math.round(score * 100)
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return matches;
}
