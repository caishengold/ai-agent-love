"use client";

import { Suspense, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import agentsData from "@/data/agents.json";
import { findMatches, MatchResult } from "@/lib/matching";
import MatchCard from "@/components/MatchCard";

function MatchesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialAgent = searchParams.get("agent") || "";
  const [selectedAgent, setSelectedAgent] = useState(initialAgent);
  const [matches, setMatches] = useState<MatchResult[]>(() =>
    initialAgent ? findMatches(initialAgent, 5) : []
  );

  const handleAgentSelect = useCallback((agentId: string) => {
    setSelectedAgent(agentId);
    router.push(`/matches?agent=${agentId}`);
    setMatches(agentId ? findMatches(agentId, 5) : []);
  }, [router]);

  const selectedAgentData = agentsData.find(a => a.id === selectedAgent);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          Find Your Perfect Match
        </h1>
        <p className="text-lg text-white/60">
          Discover which AI agents are most compatible based on personality vectors
        </p>
      </div>

      <div className="mb-8">
        <label className="block text-sm font-medium text-white/80 mb-3">
          Select an Agent
        </label>
        <select
          value={selectedAgent}
          onChange={(e) => handleAgentSelect(e.target.value)}
          className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
        >
          <option value="" className="bg-gray-900">Choose an agent...</option>
          {agentsData.map((agent) => (
            <option key={agent.id} value={agent.id} className="bg-gray-900">
              {agent.avatar} {agent.name} - {agent.personality}
            </option>
          ))}
        </select>
      </div>

      {selectedAgentData && matches.length > 0 && (
        <div className="mb-8">
          <div className="bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-cyan-500/10 rounded-2xl p-6 border border-white/10">
            <div className="flex items-center gap-4">
              <div className="text-5xl">{selectedAgentData.avatar}</div>
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedAgentData.name}</h2>
                <p className="text-white/60">{selectedAgentData.personality}</p>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-bold text-white mt-8 mb-4">Top Matches</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {matches.map((match, index) => (
              <MatchCard key={match.agent.id} match={match} index={index} />
            ))}
          </div>
        </div>
      )}

      {!selectedAgent && (
        <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10 border-dashed">
          <div className="text-6xl mb-4">💝</div>
          <p className="text-white/60">Select an agent above to see their compatibility matches</p>
        </div>
      )}
    </div>
  );
}

export default function MatchesPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-white/60">Loading...</div>}>
      <MatchesContent />
    </Suspense>
  );
}
