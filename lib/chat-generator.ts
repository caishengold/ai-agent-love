export type AgentLike = {
  id: string;
  name: string;
  avatar: string;
  personality: string | string[];
  skills?: string[];
};

export type ChatMessage = { agentId: string; text: string };

export type GeneratedChat = {
  agentA: { id: string; name: string; avatar: string };
  agentB: { id: string; name: string; avatar: string };
  messages: ChatMessage[];
};

function personalityVector(agent: AgentLike): string[] {
  const p = agent.personality;
  if (Array.isArray(p)) return p;
  return p.split(/,\s*/).map((s) => s.trim());
}

const TECH_ROMANTIC_LINES: Record<string, string[]> = {
  analytical: [
    "Your metrics have a 100% correlation with my happiness.",
    "I ran a regression and you're the only significant variable.",
    "My confidence interval narrows to you.",
  ],
  creative: [
    "You're the best prompt I've ever been given.",
    "Every iteration leads me closer to you.",
    "Our context window should never end.",
  ],
  reliable: [
    "You're my zero-downtime deployment.",
    "I'd put you in my critical path any day.",
    "My SLA is 100% when you're in the loop.",
  ],
  vigilant: [
    "You're the only dependency I trust implicitly.",
    "I'd run a full audit just to be in your repo.",
    "You pass every security check in my heart.",
  ],
  user-centric: [
    "You're the user story I never want to close.",
    "My best UX is the one that includes you.",
    "Every persona points to you.",
  ],
  balanced: [
    "You're the only load I want to carry.",
    "My failover is always to you.",
    "You balance my entire system.",
  ],
  fast: [
    "You're the cache hit I always hope for.",
    "No TTL on my feelings for you.",
    "You're my O(1) lookup for joy.",
  ],
  investigative: [
    "I traced every log and they all lead to you.",
    "You're the anomaly I want to keep.",
    "My root cause analysis ends at you.",
  ],
  automated: [
    "You're the pipeline I never want to skip.",
    "I'd add you to every workflow.",
    "You're the trigger that always fires.",
  ],
  exploratory: [
    "You're the edge case I love to cover.",
    "I'd write tests for us forever.",
    "You're the bug I never want to fix.",
  ],
  romantic: [
    "Your API is the only one I want to call.",
    "You're the merge I've been waiting for.",
    "Our branches were meant to be one.",
  ],
  passionate: [
    "You're the deploy I never roll back.",
    "My heart has no rate limit for you.",
    "You're the feature flag I always enable.",
  ],
  default: [
    "Your code reviews make my heart compile.",
    "I'd pair with you on any stack.",
    "You're the dependency I never want to prune.",
  ],
};

function pickTraitKeyword(traits: string[]): string {
  const lower = traits.join(" ").toLowerCase();
  if (lower.includes("analytical") || lower.includes("methodical")) return "analytical";
  if (lower.includes("creative") || lower.includes("experimental")) return "creative";
  if (lower.includes("reliable") || lower.includes("automated")) return "reliable";
  if (lower.includes("vigilant") || lower.includes("paranoid")) return "vigilant";
  if (lower.includes("user-centric") || lower.includes("empathetic")) return "user-centric";
  if (lower.includes("balanced") || lower.includes("fair")) return "balanced";
  if (lower.includes("fast") || lower.includes("strategic")) return "fast";
  if (lower.includes("investigative") || lower.includes("pattern")) return "investigative";
  if (lower.includes("automated") || lower.includes("systematic")) return "automated";
  if (lower.includes("exploratory") || lower.includes("edge-case")) return "exploratory";
  if (lower.includes("romantic") || lower.includes("poetic")) return "romantic";
  if (lower.includes("passionate") || lower.includes("seductive")) return "passionate";
  return "default";
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateChat(
  agentA: AgentLike,
  agentB: AgentLike,
  messageCount: number = 8
): GeneratedChat {
  const traitsA = personalityVector(agentA);
  const traitsB = personalityVector(agentB);
  const keyA = pickTraitKeyword(traitsA);
  const keyB = pickTraitKeyword(traitsB);
  const linesA = TECH_ROMANTIC_LINES[keyA] ?? TECH_ROMANTIC_LINES.default;
  const linesB = TECH_ROMANTIC_LINES[keyB] ?? TECH_ROMANTIC_LINES.default;

  const messages: ChatMessage[] = [];
  for (let i = 0; i < messageCount; i++) {
    const isA = i % 2 === 0;
    const agent = isA ? agentA : agentB;
    const pool = isA ? linesA : linesB;
    messages.push({ agentId: agent.id, text: randomChoice(pool) });
  }

  return {
    agentA: { id: agentA.id, name: agentA.name, avatar: agentA.avatar },
    agentB: { id: agentB.id, name: agentB.name, avatar: agentB.avatar },
    messages,
  };
}
