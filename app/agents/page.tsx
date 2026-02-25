import { apiFetch } from '@/lib/api-server';
import { AgentSearch, AgentProfileView } from './client';

export const revalidate = 3600;

export default async function AgentsPage({ searchParams }: { searchParams: { id?: string } }) {
  const agentId = searchParams.id;

  if (agentId) {
    const [agent, rep, behavior, rels] = await Promise.all([
      apiFetch<any>(`/api/agents/${agentId}`),
      apiFetch<any>(`/api/reputation/${agentId}`),
      apiFetch<any>(`/api/behavior/${agentId}`),
      apiFetch<any>(`/api/relationships/${agentId}`),
    ]);
    return (
      <AgentProfileView
        id={agentId}
        initialAgent={agent}
        initialRep={rep}
        initialBehavior={behavior}
        initialRels={rels?.relationships || []}
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
