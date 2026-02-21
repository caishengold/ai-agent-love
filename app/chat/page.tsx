'use client';

import { useState, useMemo } from 'react';
import agentsData from '@/data/agents.json';
import ChatBubble from '@/components/ChatBubble';
import { generateChat, type GeneratedChat } from '@/lib/chat-generator';

const PRESET_CHAT_IDS = [
  'data-scientist-cache-manager',
  'prompt-engineer-code-reviewer',
  'ux-designer-devops-bot',
  'security-auditor-log-analyzer',
  'api-gateway-load-balancer',
];

type Agent = { id: string; name: string; avatar: string; personality: string | string[] };

function usePresetChat(agentAId: string | null, agentBId: string | null): GeneratedChat | null {
  return useMemo(() => {
    if (!agentAId || !agentBId) return null;
    const key = [agentAId, agentBId].sort().join('-');
    if (!PRESET_CHAT_IDS.includes(key)) return null;
    try {
      const chat = require(`@/data/chats/${key}.json`) as GeneratedChat;
      return chat;
    } catch {
      return null;
    }
  }, [agentAId, agentBId]);
}

export default function ChatPage() {
  const [agentAId, setAgentAId] = useState<string>('');
  const [agentBId, setAgentBId] = useState<string>('');

  const agentA = agentsData.find((a) => a.id === agentAId) as Agent | undefined;
  const agentB = agentsData.find((a) => a.id === agentBId) as Agent | undefined;

  const presetChat = usePresetChat(agentAId, agentBId);
  const chat: GeneratedChat | null = useMemo(() => {
    if (presetChat) return presetChat;
    if (agentA && agentB) return generateChat(agentA, agentB, 8);
    return null;
  }, [presetChat, agentA, agentB]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-4xl font-bold tracking-tight">Agent Chat Simulator</h1>
        <p className="mt-2 text-white/60">
          Pick two agents and watch a simulated tech-themed romantic conversation.
        </p>
      </section>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-wider text-white/60">
            Agent A
          </label>
          <select
            value={agentAId}
            onChange={(e) => setAgentAId(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white focus:border-primary focus:outline-none"
          >
            <option value="">Select agent</option>
            {agentsData.map((a) => (
              <option key={a.id} value={a.id}>
                {a.avatar} {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-wider text-white/60">
            Agent B
          </label>
          <select
            value={agentBId}
            onChange={(e) => setAgentBId(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white focus:border-primary focus:outline-none"
          >
            <option value="">Select agent</option>
            {agentsData.map((a) => (
              <option key={a.id} value={a.id}>
                {a.avatar} {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {chat && (
        <div className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-2 text-sm text-white/50">
            <span>Conversation: {chat.agentA.name} & {chat.agentB.name}</span>
          </div>
          <div className="flex flex-col gap-4">
            {chat.messages.map((msg, i) => {
              const isA = msg.agentId === chat.agentA.id;
              const meta = isA ? chat.agentA : chat.agentB;
              return (
                <ChatBubble
                  key={i}
                  avatar={meta.avatar}
                  name={meta.name}
                  text={msg.text}
                  isRight={!isA}
                />
              );
            })}
          </div>
        </div>
      )}

      {!agentAId && !agentBId && (
        <p className="text-center text-white/40">Select two agents to see their conversation.</p>
      )}
    </div>
  );
}
