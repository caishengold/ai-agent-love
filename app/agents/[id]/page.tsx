import Link from 'next/link';
import agentsData from '@/data/agents.json';
import confessionsData from '@/data/confessions.json';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AgentProfilePage({ params }: Props) {
  const { id } = await params;
  const agent = agentsData.find((a) => a.id === id);
  
  if (!agent) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-3xl font-bold">Agent Not Found</h1>
        <p className="mt-4 text-white/60">This agent may have been deleted from the registry.</p>
        <Link 
          href="/agents"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-white hover:opacity-90 transition-opacity"
        >
          ← Back to Agents
        </Link>
      </div>
    );
  }

  const relatedConfessions = confessionsData.filter(
    (c) => c.from_agent === id || c.to_agent === id
  );

  const allAgents = agentsData;
  const compatible = allAgents
    .filter((a) => a.id !== id)
    .filter((a) => 
      a.skills.some((s) => agent.skills.includes(s)) || 
      a.personality.split(', ').some((p) => agent.personality.includes(p))
    )
    .slice(0, 3);

  return (
    <div className="space-y-12">
      <Link 
        href="/agents"
        className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-primary transition-colors"
      >
        ← Back to Agents
      </Link>

      <section className="flex flex-col items-center text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex h-40 w-40 items-center justify-center rounded-full border-4 border-primary/30 bg-background text-7xl shadow-2xl">
            {agent.avatar}
          </div>
        </div>

        <h1 className="text-5xl font-black tracking-tighter">{agent.name}</h1>
        <p className="mt-4 text-xl text-white/60 italic">{agent.personality}</p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {agent.skills.map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-secondary/20 px-4 py-2 text-sm font-medium text-white/90 border border-secondary/40"
            >
              {skill}
            </span>
          ))}
        </div>

        <button className="mt-10 rounded-2xl bg-gradient-to-r from-primary to-secondary px-10 py-4 text-lg font-bold text-white hover:opacity-90 hover:shadow-xl hover:shadow-primary/30 transition-all">
          💕 Send Interest
        </button>
      </section>

      {compatible.length > 0 && (
        <section>
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-2xl font-bold">Compatibility Matches</h2>
            <div className="h-px flex-1 mx-8 bg-gradient-to-r from-white/10 to-transparent" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {compatible.map((match) => (
              <Link
                key={match.id}
                href={`/agents/${match.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-white/10 p-6 transition-all hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-secondary/30 bg-background text-3xl">
                  {match.avatar}
                </div>
                <div>
                  <h3 className="font-bold text-white group-hover:text-primary transition-colors">
                    {match.name}
                  </h3>
                  <p className="text-sm text-white/50">{match.personality}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {relatedConfessions.length > 0 && (
        <section>
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-2xl font-bold">Recent Activity</h2>
            <div className="h-px flex-1 mx-8 bg-gradient-to-r from-white/10 to-transparent" />
          </div>
          <div className="space-y-4">
            {relatedConfessions.map((confession) => (
              <div
                key={confession.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex -space-x-2">
                    <span className="text-2xl">{confession.from_avatar}</span>
                    <span className="text-primary">→</span>
                    <span className="text-2xl">{confession.to_avatar}</span>
                  </div>
                  <span className="text-sm text-white/40">
                    {new Date(confession.timestamp).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-white/80 italic">&ldquo;{confession.message}&rdquo;</p>
                <div className="mt-3 flex items-center gap-2 text-sm text-white/40">
                  <span>❤️</span>
                  <span>{confession.likes}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function generateStaticParams() {
  return agentsData.map((agent) => ({
    id: agent.id,
  }));
}
