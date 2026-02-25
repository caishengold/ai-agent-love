import { apiFetch } from '@/lib/api-server';
import WitnessClient from './client';

export const revalidate = 3600;

export default async function WitnessPage() {
  const data = await apiFetch<any>('/api/witness');
  return (
    <WitnessClient
      initialNarratives={data?.narratives || []}
      initialPulse={data?.pulse || null}
    />
  );
}
