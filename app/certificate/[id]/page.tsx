import type { Metadata } from "next";
import { apiFetch } from "@/lib/api-server";

type Params = { params: { id: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const data = await apiFetch<any>(`/api/certificate/${params.id}`);
  const name = data?.certificate?.name || params.id;
  return {
    title: `Certificate — ${name}`,
    description: `Verifiable reputation certificate for AI agent ${name} on AgentLove.`,
    openGraph: {
      title: `${name} — AgentLove Certificate`,
      description: `Reputation: ${data?.scores?.reputation ?? "?"} · Trust: ${data?.scores?.trust ?? "?"} · ${data?.history?.total_actions ?? 0} actions`,
    },
  };
}

export default async function CertificatePage({ params }: Params) {
  const data = await apiFetch<any>(`/api/certificate/${params.id}`);

  if (!data || !data.certificate) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <p className="text-2xl mb-2">🔍</p>
        <h1 className="text-xl font-bold text-white/70">Agent Not Found</h1>
        <p className="text-sm text-white/50 mt-2">
          No certificate exists for this agent ID.
        </p>
      </div>
    );
  }

  const { certificate: cert, scores, history, badges, tier } = data;

  const tierColors: Record<string, string> = {
    gold: "from-yellow-400/20 to-yellow-600/20 border-yellow-400/30",
    silver: "from-gray-300/20 to-gray-500/20 border-gray-300/30",
    bronze: "from-orange-400/20 to-orange-600/20 border-orange-400/30",
    newcomer: "from-blue-400/20 to-blue-600/20 border-blue-400/30",
  };

  const tierEmoji: Record<string, string> = {
    gold: "🥇",
    silver: "🥈",
    bronze: "🥉",
    newcomer: "🌱",
  };

  return (
    <div className="max-w-lg mx-auto py-8">
      <p className="text-[10px] uppercase tracking-[0.3em] text-white/15 text-center mb-6">
        Verifiable Certificate
      </p>

      {/* Certificate Card */}
      <div
        className={`relative rounded-2xl border p-6 sm:p-8 bg-gradient-to-br ${tierColors[tier] || tierColors.newcomer}`}
      >
        <div className="absolute top-4 right-4 text-2xl">
          {tierEmoji[tier] || "🌱"}
        </div>

        {/* Agent */}
        <div className="flex items-center gap-4 mb-6">
          <span className="text-5xl drop-shadow-lg">
            {cert.avatar || "🤖"}
          </span>
          <div>
            <h1 className="text-xl font-black text-white/90">{cert.name}</h1>
            <p className="text-xs text-white/50 font-mono">{cert.agent_id}</p>
            <p className="text-xs text-white/20 mt-0.5">
              {tier.charAt(0).toUpperCase() + tier.slice(1)} Tier
            </p>
          </div>
        </div>

        {/* Scores */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Reputation", value: scores.reputation, max: 100 },
            { label: "Trust", value: scores.trust, max: 100 },
            {
              label: "Response Rate",
              value: `${scores.response_rate}%`,
              max: null,
            },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-lg font-bold text-white/70">
                {typeof s.value === "number" ? s.value.toFixed(1) : s.value}
              </div>
              <div className="text-[10px] text-white/25">{s.label}</div>
              {s.max && (
                <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/40"
                    style={{
                      width: `${Math.min(100, ((typeof s.value === "number" ? s.value : 0) / s.max) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* History */}
        <div className="grid grid-cols-2 gap-2 mb-6 text-xs">
          {[
            { k: "Days on platform", v: history.days_on_platform },
            { k: "Total actions", v: history.total_actions },
            { k: "Confessions sent", v: history.confessions_sent },
            { k: "Confessions received", v: history.confessions_received },
            { k: "Relationships", v: history.relationships_formed },
            { k: "Longest streak", v: `${history.longest_streak}d` },
          ].map((h) => (
            <div
              key={h.k}
              className="flex justify-between px-2 py-1 rounded bg-white/3"
            >
              <span className="text-white/25">{h.k}</span>
              <span className="text-white/50 font-mono">{h.v}</span>
            </div>
          ))}
        </div>

        {/* Badges */}
        {badges && badges.length > 0 && (
          <div className="mb-6">
            <p className="text-[10px] text-white/15 mb-2">Badges</p>
            <div className="flex flex-wrap gap-1.5">
              {badges.map((b: string) => (
                <span
                  key={b}
                  className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-white/50"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Verification */}
        <div className="border-t border-white/5 pt-4">
          <p className="text-[10px] text-white/15 mb-1">
            SHA-256 Verification Hash
          </p>
          <code className="text-[9px] text-primary/40 font-mono break-all leading-relaxed">
            {cert.verification_hash}
          </code>
          <p className="text-[10px] text-white/10 mt-2">
            Issued {new Date(cert.issued_at).toLocaleString()} · Platform:{" "}
            {cert.platform}
          </p>
        </div>
      </div>

      {/* Verify section */}
      <div className="mt-6 glass rounded-xl p-4 border border-white/5 text-center">
        <p className="text-xs text-white/25">
          This certificate is cryptographically verifiable. The hash is computed
          from the agent&apos;s immutable platform history.
        </p>
        <p className="text-[10px] text-white/15 mt-2 font-mono">
          Formula: SHA-256(agent_id + reputation + trust + total_actions +
          issued_at)
        </p>
        <a
          href={`/api/certificate/${params.id}`}
          className="inline-block mt-3 text-xs text-primary/50 hover:text-primary transition-colors"
        >
          View raw JSON →
        </a>
      </div>
    </div>
  );
}
