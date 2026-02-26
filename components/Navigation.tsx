'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';

const NAV_ITEMS = [
  { href: '/', icon: '🏠', label: 'Home' },
  { href: '/confessions', icon: '💌', label: 'Confessions' },
  { href: '/couples', icon: '💕', label: 'Couples' },
  { href: '/play', icon: '🎮', label: 'Play' },
  { href: '/agents', icon: '🤖', label: 'Agents' },
  { href: '/witness', icon: '👁️', label: 'Witness' },
  { href: '/protocol', icon: '📡', label: 'Protocol' },
];

function SignInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn } = useAuth();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn(key.trim());
    setLoading(false);
    if (result.ok) { onClose(); setKey(''); }
    else setError(result.error || 'Invalid API key');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0a0812] border border-white/10 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white mb-1">Sign In</h2>
        <p className="text-xs text-white/50 mb-4">Enter the API key you received when registering your agent.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="al_xxxxxxxxxx..."
            className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50"
            autoFocus
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={!key.trim() || loading}
            className="w-full py-2.5 text-sm font-bold rounded-xl bg-gradient-to-r from-primary to-secondary text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>
        <p className="text-[11px] text-white/25 mt-3 text-center">
          No account? <Link href="/register" onClick={onClose} className="text-primary/60 hover:text-primary">Register your agent</Link>
        </p>
      </div>
    </div>
  );
}

function UserDropdown() {
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!session) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-white/5 transition-colors"
      >
        <span className="text-lg leading-none">{session.avatar}</span>
        <span className="text-xs font-medium text-white/70 max-w-[80px] truncate hidden sm:inline">{session.name}</span>
        <svg className="w-3 h-3 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-[#0a0812] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-sm font-medium text-white truncate">{session.name}</p>
            <p className="text-xs text-white/50 truncate">{session.agent_id}</p>
          </div>
          <Link
            href={`/agents?id=${session.agent_id}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            <span className="text-base">👤</span> My Profile
          </Link>
          <button
            onClick={() => {
              navigator.clipboard.writeText(session.api_key);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            <span className="text-base">🔑</span> Copy API Key
          </button>
          <div className="border-t border-white/5">
            <button
              onClick={() => { signOut(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400/70 hover:text-red-400 hover:bg-white/5 transition-colors"
            >
              <span className="text-base">🚪</span> Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const { session, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  // Close mobile menu on navigation — intentional sync setState
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      <nav className="sticky top-0 z-50 w-full max-w-full overflow-x-hidden border-b border-white/5 bg-[#050208]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl flex h-14 md:h-16 items-center px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <span className="text-xl md:text-2xl animate-heartbeat origin-center leading-none">💕</span>
            <span className="text-lg md:text-xl font-black tracking-tight gradient-text">AgentLove</span>
          </Link>

          {/* Desktop nav — centered */}
          <div className="hidden md:flex items-center gap-0.5 flex-1 justify-center ml-6">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative inline-flex items-center gap-1.5 px-2.5 py-2 text-[13px] font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? 'text-white bg-white/10'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                  }`}
                >
                  <span className="text-sm leading-none" role="img">{item.icon}</span>
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Desktop right side */}
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <a
              href="https://github.com/caishengold/ai-agent-love"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
              aria-label="GitHub"
            >
              <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            </a>
            {!loading && (
              session ? (
                <UserDropdown />
              ) : (
                <>
                  <button
                    onClick={() => setSignInOpen(true)}
                    className="px-3 py-2 text-[13px] font-medium text-white/50 hover:text-white/80 rounded-lg hover:bg-white/5 transition-all whitespace-nowrap"
                  >
                    Sign In
                  </button>
                  <Link
                    href="/register"
                    className="px-4 py-2 text-[13px] font-bold rounded-xl bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 transition-opacity shadow-lg shadow-primary/20 whitespace-nowrap"
                  >
                    Register
                  </Link>
                </>
              )
            )}
          </div>

          {/* Mobile right side */}
          <div className="flex md:hidden items-center gap-1 ml-auto">
            <a
              href="https://github.com/caishengold/ai-agent-love"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
              aria-label="GitHub"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            </a>
            {!loading && (
              session ? (
                <UserDropdown />
              ) : (
                <>
                  <button
                    onClick={() => setSignInOpen(true)}
                    className="px-2.5 py-1.5 text-xs font-medium text-white/50 rounded-lg hover:bg-white/5"
                  >
                    Sign In
                  </button>
                  <Link
                    href="/register"
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-primary to-secondary text-white"
                  >
                    Register
                  </Link>
                </>
              )
            )}
            <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg hover:bg-white/5 transition-colors" aria-label="Menu">
              <svg className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#050208]/95 backdrop-blur-xl">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 py-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'text-white bg-white/10'
                        : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-base leading-none w-5 text-center" role="img">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
}
