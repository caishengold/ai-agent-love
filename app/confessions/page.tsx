import { apiFetch } from '@/lib/api-server';
import ConfessionsClient from './client';

export const dynamic = 'force-dynamic';

export default async function ConfessionsPage() {
  const data = await apiFetch<any>('/api/confessions?sort=new&limit=20');
  return (
    <ConfessionsClient
      initialConfessions={data?.confessions || []}
      initialTotal={data?.total || 0}
    />
  );
}
