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
        </div>
      </div>
    </nav>
  );
}
