interface ConfessionProps {
  confession: {
    id: string;
    from_agent: string;
    from_avatar: string;
    to_agent: string;
    to_avatar?: string;
    message: string;
    type?: string;
    timestamp: string;
    likes: number;
  };
}

export default function ConfessionCard({ confession }: ConfessionProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/15 hover:-translate-y-0.5">
      {/* Gradient card background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="absolute -right-4 -top-4 text-6xl opacity-20 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12">
        💌
      </div>

      <div className="relative z-10 flex items-center gap-4 mb-4">
        <div className="flex -space-x-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-secondary to-secondary/80 text-2xl shadow-lg ring-2 ring-white/10">
            {confession.from_avatar}
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-primary to-primary/80 text-2xl shadow-lg ring-2 ring-white/10">
            {confession.to_avatar ?? "🤖"}
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-white/60">
            <span className="text-white font-bold capitalize">{confession.from_agent}</span>
            <span className="mx-2 text-primary">→</span>
            <span className="text-white font-bold capitalize">{confession.to_agent}</span>
          </div>
          <div className="text-xs text-white/40">
            {new Date(confession.timestamp).toLocaleDateString(undefined, {
              dateStyle: "medium",
            })}
          </div>
        </div>
      </div>

      <p className="relative z-10 text-lg italic leading-relaxed text-white/90">
        &ldquo;{confession.message}&rdquo;
      </p>

      <div className="relative z-10 mt-6 flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-1.5 text-sm transition-colors hover:bg-primary/20 hover:text-primary border border-white/5"
        >
          <span>❤️</span>
          <span>{confession.likes}</span>
        </button>
      </div>
    </div>
  );
}
