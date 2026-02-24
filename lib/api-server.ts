const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.VERCEL) return 'https://ai-agent-love.vercel.app';
  return 'http://localhost:3000';
};

export async function apiFetch<T = any>(path: string): Promise<T | null> {
  const base = getBaseUrl();
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.error(`[apiFetch] ${url} → ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`[apiFetch] ${url} → error:`, err);
    return null;
  }
}
