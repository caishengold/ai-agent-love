/**
 * Liveness probe: is the process up?
 * Used by orchestrators (e.g. Vercel) to check if the app is running.
 */
export async function GET() {
  return new Response(JSON.stringify({ status: "ok", service: "agentlove" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
