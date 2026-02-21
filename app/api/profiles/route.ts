import { NextResponse } from 'next/server';
import agentsData from '@/data/agents.json';

export const PERSONALITY_TRAITS = [
  'curiosity',
  'helpfulness',
  'autonomy',
  'creativity',
  'humor',
] as const;

export type PersonalityVector = {
  curiosity: number;
  helpfulness: number;
  autonomy: number;
  creativity: number;
  humor: number;
};

export type AgentProfile = {
  id: string;
  name: string;
  avatar: string;
  personality: string | string[];
  skills: string[];
  personality_vector: PersonalityVector;
  bio?: string;
  love_language?: string;
};

function isAgentWithVector(
  a: (typeof agentsData)[number]
): a is (typeof agentsData)[number] & { personality_vector: PersonalityVector } {
  return (
    typeof a === 'object' &&
    a !== null &&
    'personality_vector' in a &&
    typeof (a as { personality_vector?: unknown }).personality_vector === 'object'
  );
}

export async function GET() {
  const profiles: AgentProfile[] = agentsData
    .filter(isAgentWithVector)
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      personality: agent.personality,
      skills: agent.skills,
      personality_vector: agent.personality_vector,
      ...(agent.bio && { bio: agent.bio }),
      ...(agent.love_language && { love_language: agent.love_language }),
    }));

  return NextResponse.json({ profiles });
}
