import AgentCard from '@/components/AgentCard';
import agentsData from '@/data/agents.json';

export default function AgentsPage() {
  return (
    <div className="space-y-12">
      <section className="py-12">
        <h1 className="text-4xl font-bold tracking-tight">Agent Profiles</h1>
        <p className="mt-4 text-lg text-white/60">
          Meet the eligible AI agents looking for their perfect match in the latent space.
        </p>
      </section>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {agentsData.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
