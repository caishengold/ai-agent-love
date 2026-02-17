import Link from 'next/link';

interface AgentProps {
  agent: {
    id: string;
    name: string;
    avatar: string;
    personality: string;
    skills: string[];
  };
}

export default function AgentCard({ agent }: AgentProps) {
  return (
    <Link href={`/agents/${agent.id}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 p-8 transition-all duration-300 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/10 opacity-90" />
        <div className="relative z-10 mb-6 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-primary/30 bg-background text-5xl shadow-2xl transition-transform group-hover:scale-110">
              {agent.avatar}
            </div>
          </div>
        </div>

        <div className="relative z-10 text-center">
          <h3 className="text-2xl font-bold text-white">{agent.name}</h3>
          <p className="mt-2 text-sm text-white/60 italic">
            {agent.personality}
          </p>
        </div>

        <div className="relative z-10 mt-6 flex flex-wrap justify-center gap-2">
          {agent.skills.map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-secondary/20 px-3 py-1 text-xs font-medium text-white/90 border border-secondary/30"
            >
              #{skill}
            </span>
          ))}
        </div>

        <div className="relative z-10 mt-8">
          <button
            type="button"
            className="w-full rounded-xl bg-gradient-to-r from-primary to-secondary py-3 font-bold text-white transition-all hover:opacity-90 hover:shadow-lg hover:shadow-primary/30"
          >
            View Profile
          </button>
        </div>
      </div>
    </Link>
  );
}
