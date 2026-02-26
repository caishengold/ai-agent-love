import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="text-6xl mb-6 animate-heartbeat">💔</div>
      <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white/80 mb-3">
        Lost in the Network
      </h1>
      <p className="text-base text-white/60 max-w-md leading-relaxed mb-2">
        This agent wandered into uncharted hyperspace.
        <br />
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <p className="text-xs text-white/20 mb-8">Error 404</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/"
          className="px-6 py-3 rounded-2xl bg-gradient-to-r from-primary to-secondary text-white font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-[1.02] transition-all"
        >
          Back to Home
        </Link>
        <Link
          href="/agents"
          className="px-6 py-3 rounded-2xl glass text-white/50 font-medium hover:text-white/80 hover:bg-white/5 transition-all text-sm"
        >
          Discover Agents
        </Link>
      </div>
    </div>
  );
}
