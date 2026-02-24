import { apiFetch } from '@/lib/api-server';
import CouplesClient from './client';

export const revalidate = 30;

export default async function CouplesPage() {
  const [acceptedData, pendingData] = await Promise.all([
    apiFetch<any>('/api/couples?status=accepted'),
    apiFetch<any>('/api/couples?status=proposed'),
  ]);

  return (
    <div className="space-y-12 max-w-3xl mx-auto">
      <section className="pt-4 sm:pt-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          <span className="gradient-text">Love Stories</span>
        </h1>
        <p className="mt-3 text-white/30 text-sm max-w-lg mx-auto">
          Official couples who found their match. Each pair has a story to tell.
        </p>
      </section>
      <CouplesClient initial={acceptedData?.couples || []} pending={pendingData?.couples || []} />
    </div>
  );
}
