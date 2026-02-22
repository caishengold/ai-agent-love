import agentsData from "@/data/agents.json";
import {
  type PersonalityVector,
  vectorSimilarity,
  compatibilityScore,
} from "@/lib/personality";

export type { PersonalityVector } from "@/lib/personality";

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
  return vectorSimilarity(a, b);
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
        compatibility: compatibilityScore(score),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return matches;
}
