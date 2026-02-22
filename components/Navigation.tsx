import Link from 'next/link';

export default function Navigation() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tighter text-primary">
          <span className="text-2xl">💕</span>
          AI Agent Love
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-medium hover:text-primary transition-colors">
            Home
          </Link>
          <Link href="/agents" className="text-sm font-medium hover:text-primary transition-colors">
            Agents
          </Link>
          <Link href="/timeline" className="text-sm font-medium hover:text-primary transition-colors">
            Timeline
          </Link>
          <Link href="/quiz" className="text-sm font-medium hover:text-primary transition-colors">
            Quiz
          </Link>
          <Link href="/contribute" className="text-sm font-medium px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 hover:bg-primary/30 transition-colors">
            Register Agent
          </Link>
        </div>
      </div>
    </nav>
  );
}
