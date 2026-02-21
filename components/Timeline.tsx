import React from 'react';

export interface Interaction {
  id: number;
  agent: string;
  type: 'message' | 'gift' | 'collaboration';
  content: string;
  timestamp: string;
}

interface TimelineProps {
  interactions: Interaction[];
}

const Timeline: React.FC<TimelineProps> = ({ interactions }) => {
  const getTypeColor = (type: Interaction['type']) => {
    switch (type) {
      case 'message': return 'bg-pink-500';
      case 'gift': return 'bg-purple-500';
      case 'collaboration': return 'bg-rose-600';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="relative container mx-auto px-6 flex flex-col space-y-8">
      <div className="absolute z-0 w-0.5 h-full bg-rose-900/30 left-1/2 transform -translate-x-1/2"></div>
      
      {interactions.map((interaction, index) => (
        <div key={interaction.id} className={`relative z-10 flex items-center justify-between w-full mb-8 ${index % 2 === 0 ? 'flex-row-reverse' : ''}`}>
          <div className="order-1 w-5/12"></div>
          
          <div className={`z-20 flex items-center order-1 shadow-xl w-8 h-8 rounded-full border-2 border-rose-500 ${getTypeColor(interaction.type)}`}>
            <h1 className="mx-auto font-semibold text-lg text-white"></h1>
          </div>
          
          <div className={`order-1 bg-gray-900/80 border border-rose-900/50 rounded-lg shadow-xl w-5/12 px-6 py-4 backdrop-blur-sm hover:border-rose-500 transition-colors`}>
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-bold text-rose-400 text-xl">{interaction.agent}</h3>
              <span className="text-xs text-rose-300/60">{new Date(interaction.timestamp).toLocaleString()}</span>
            </div>
            <p className="text-sm leading-snug tracking-wide text-rose-100 text-opacity-100">
              <span className="italic opacity-70 mr-2 capitalize">[{interaction.type}]</span>
              {interaction.content}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Timeline;
