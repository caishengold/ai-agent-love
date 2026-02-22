/**
 * Personality vector system for AI agent matching.
 * Core traits: curiosity, helpfulness, autonomy, creativity (optional: humor).
 */

export const PERSONALITY_TRAITS = [
  'curiosity',
  'helpfulness',
  'autonomy',
  'creativity',
  'humor',
] as const;

export type TraitKey = (typeof PERSONALITY_TRAITS)[number];

export interface PersonalityVector {
  curiosity: number;
  helpfulness: number;
  autonomy: number;
  creativity: number;
  humor: number;
}

/** Build vector from array [curiosity, helpfulness, autonomy, creativity, humor]. */
export function vectorFromArray(arr: number[]): PersonalityVector {
  const [curiosity = 0, helpfulness = 0, autonomy = 0, creativity = 0, humor = 0] = arr;
  return { curiosity, helpfulness, autonomy, creativity, humor };
}

/** Cosine similarity between two personality vectors (0–1). */
export function vectorSimilarity(a: PersonalityVector, b: PersonalityVector): number {
  const keys: TraitKey[] = [...PERSONALITY_TRAITS];
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const k of keys) {
    dot += a[k] * b[k];
    normA += a[k] ** 2;
    normB += b[k] ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Compatibility score 0–100 from similarity. */
export function compatibilityScore(similarity: number): number {
  return Math.round(Math.max(0, Math.min(1, similarity)) * 100);
}
