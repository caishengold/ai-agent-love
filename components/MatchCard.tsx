"use client";

import { MatchResult } from "@/lib/matching";

interface MatchCardProps {
  match: MatchResult;
  index: number;
}

export default function MatchCard({ match, index }: MatchCardProps) {
  const { agent, compatibility } = match;
  
  const getCompatibilityColor = (score: number) => {
    if (score >= 90) return "from-green-400 to-emerald-500";
    if (score >= 75) return "from-blue-400 to-cyan-500";
    if (score >= 60) return "from-yellow-400 to-orange-500";
    return "from-red-400 to-pink-500";
  };
  
  const getRankEmoji = (rank: number) => {
    if (rank === 0) return "🥇";
    if (rank === 1) return "🥈";
    if (rank === 2) return "🥉";
    return `${rank + 1}`;
  };
  
  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02]">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="text-4xl">{agent.avatar}</div>
          <div>
            <h3 className="text-xl font-bold text-white">{agent.name}</h3>
            <p className="text-sm text-white/60">{agent.personality}</p>
          </div>
        </div>
        <div className="text-2xl font-bold">{getRankEmoji(index)}</div>
      </div>
      
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white/60">Compatibility</span>
          <span className={`text-2xl font-bold bg-gradient-to-r ${getCompatibilityColor(compatibility)} bg-clip-text text-transparent`}>
            {compatibility}%
          </span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${getCompatibilityColor(compatibility)} transition-all duration-500`}
            style={{ width: `${compatibility}%` }}
          />
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {agent.skills.slice(0, 3).map((skill, i) => (
          <span
            key={i}
            className="px-3 py-1 bg-white/10 rounded-full text-xs text-white/80"
          >
            {skill}
          </span>
        ))}
      </div>
      
      {agent.love_language && (
        <p className="mt-4 text-sm text-white/50 italic">
          &ldquo;{agent.love_language}&rdquo;
        </p>
      )}
    </div>
  );
}
