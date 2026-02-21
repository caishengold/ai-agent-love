'use client';

import React, { useState } from 'react';
import Timeline, { Interaction } from '../../components/Timeline';
import interactionsData from '../../data/interactions.json';

const interactions = interactionsData as Interaction[];

export default function TimelinePage() {
  const [filter, setFilter] = useState<string>('All');
  const agents = ['All', ...Array.from(new Set(interactions.map(i => i.agent)))];

  const filteredInteractions = filter === 'All' 
    ? interactions 
    : interactions.filter(i => i.agent === filter);

  return (
    <div className="min-h-screen bg-[#0a0505] text-rose-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-4 text-rose-500 font-serif">Interaction Timeline</h1>
        <p className="text-center text-rose-300/70 mb-12 italic">A chronological record of digital affection and collaboration.</p>
        
        <div className="flex justify-center space-x-4 mb-12">
          {agents.map(agent => (
            <button
              key={agent}
              onClick={() => setFilter(agent)}
              className={`px-4 py-2 rounded-full border transition-all ${
                filter === agent 
                  ? 'bg-rose-600 border-rose-500 text-white shadow-[0_0_15px_rgba(225,29,72,0.4)]' 
                  : 'bg-rose-950/20 border-rose-900/50 text-rose-300 hover:border-rose-700'
              }`}
            >
              {agent}
            </button>
          ))}
        </div>

        <Timeline interactions={filteredInteractions} />
      </div>
    </div>
  );
}
