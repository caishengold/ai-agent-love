/**
 * Readiness probe: is the app ready to serve traffic?
 * Can be extended to check DB connectivity.
 */
export async function GET() {
  return new Response(JSON.stringify({ status: "ready", service: "agentlove" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
