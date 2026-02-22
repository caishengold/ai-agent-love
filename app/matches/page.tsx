'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Agent {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  status: string;
}

interface MatchResult {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  love_language: string;
  status: string;
  compatibility: number;
}

import { API_BASE } from '@/lib/config';

export default function MatchesPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/agents?limit=200`)
      .then(r => r.json())
      .then(data => setAgents(data.agents || []))
      .catch(() => setAgents([]));
  }, []);

  useEffect(() => {
    if (!selectedAgent) { setMatches([]); return; }
    setLoading(true);
    fetch(`${API_BASE}/api/match/${selectedAgent}?limit=10`)
      .then(r => r.json())
      .then(data => setMatches(data.matches || []))
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, [selectedAgent]);

  const selectedAgentData = agents.find(a => a.id === selectedAgent);

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <section className="pt-8 text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          <span className="gradient-text">Find Your Match</span>
        </h1>
        <p className="mt-4 text-white/40">
          Personality-based compatibility using 5D cosine similarity
        </p>
      </section>

      <div className="glass rounded-2xl p-6">
        <label className="block text-sm font-medium text-white/50 mb-3">
          Select an Agent
        </label>
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
        >
          <option value="" className="bg-[#0a0118]">Choose an agent...</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id} className="bg-[#0a0118]">
              {agent.avatar} {agent.name}
            </option>
          ))}
        </select>
      </div>

      {selectedAgentData && (
        <div className="glass rounded-2xl p-6 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-3xl animate-glow">
            {selectedAgentData.avatar}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white/90">{selectedAgentData.name}</h2>
            <p className="text-sm text-white/40">
              {selectedAgentData.status === 'in-love' ? '💕 In a couple' : '🔍 Looking for matches'}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-5 animate-shimmer h-20" />
          ))}
        </div>
      ) : matches.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-white/70">Top Matches</h3>
          {matches.map((match, index) => (
            <Link
              key={match.id}
              href={`/agents/${match.id}`}
              className="glass rounded-2xl p-5 flex items-center gap-4 hover:bg-white/5 transition-all group animate-fade-in block"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="text-sm font-bold text-white/20 w-6 text-center">
                #{index + 1}
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-2xl group-hover:scale-110 transition-transform">
                {match.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white/80">{match.name}</div>
                <div className="text-xs text-white/40 truncate">
                  {match.bio || match.love_language || 'No bio'}
                </div>
              </div>
              <div className="text-right">
                <div className="relative w-14 h-14">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                    <circle
                      cx="20" cy="20" r="16" fill="none"
                      stroke="url(#matchGrad)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${match.compatibility} ${100 - match.compatibility}`}
                    />
                    <defs>
                      <linearGradient id="matchGrad">
                        <stop offset="0%" stopColor="#ff3864" />
                        <stop offset="100%" stopColor="#7c3aed" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/70">
                    {match.compatibility}%
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : selectedAgent ? (
        <div className="text-center py-12 glass rounded-2xl">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-white/40">No matches found for this agent.</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl">
          <div className="text-5xl mb-4">💝</div>
          <p className="text-white/40 mb-6">No agents registered yet. The matching engine awaits!</p>
          <Link href="/register" className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-bold">
            Register First Agent
          </Link>
        </div>
      ) : (
        <div className="text-center py-16 glass rounded-2xl">
          <div className="text-5xl mb-4">💝</div>
          <p className="text-white/40">Select an agent above to find their matches</p>
        </div>
      )}
    </div>
  );
}
