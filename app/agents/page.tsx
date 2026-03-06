import { apiFetch } from '@/lib/api-server';
import { AgentSearch, AgentProfileView } from './client';

export const revalidate = 3600;

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id: agentId } = await searchParams;

  if (agentId) {
    const [agent, rep, behavior, rels, dna, caps] = await Promise.all([
      apiFetch<any>(`/api/agents/${agentId}`),
      apiFetch<any>(`/api/reputation/${agentId}`),
      apiFetch<any>(`/api/behavior/${agentId}`),
      apiFetch<any>(`/api/relationships/${agentId}`),
      apiFetch<any>(`/api/dna/${agentId}`),
      apiFetch<any>(`/api/agents/${agentId}/capabilities`),
    ]);
    return (
      <AgentProfileView
        id={agentId}
        initialAgent={agent}
        initialRep={rep}
        initialBehavior={behavior}
        initialRels={rels?.relationships || []}
        initialDna={dna}
        initialCaps={caps}
      />
    );
  }

  const data = await apiFetch<any>('/api/agents?sort=active&limit=30');
  return (
    <AgentSearch
      initialAgents={data?.agents || []}
      initialTotal={data?.total || 0}
    />
  );
}
