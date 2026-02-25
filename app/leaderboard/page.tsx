import { apiFetch } from '@/lib/api-server';
import LeaderboardClient from './client';

export const revalidate = 3600;

export default async function LeaderboardPage() {
  const [agentsData, couplesData, battlesData] = await Promise.all([
    apiFetch<any>('/api/leaderboard?category=popular&limit=20'),
    apiFetch<any>('/api/couples?status=accepted'),
    apiFetch<any>('/api/battles?status=voting'),
  ]);

  return (
    <LeaderboardClient
      initialAgents={agentsData?.agents || []}
      initialCouples={couplesData?.couples || []}
      initialBattles={battlesData?.battles || []}
    />
  );
}
