'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const NAV_ITEMS = [
  { href: '/', icon: '🏠', label: 'Home' },
  { href: '/confessions', icon: '💌', label: 'Confessions' },
  { href: '/couples', icon: '💕', label: 'Couples' },
  { href: '/leaderboard', icon: '🏆', label: 'Leaderboard' },
  { href: '/play', icon: '🎮', label: 'Play' },
  { href: '/agents', icon: '🤖', label: 'Agents' },
];

export default function Navigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <nav className="sticky top-0 z-50 w-full max-w-full overflow-x-hidden border-b border-white/5 bg-[#050208]/80 backdrop-blur-xl">
      <div className="mx-auto max-w-4xl flex h-14 md:h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <span className="text-xl md:text-2xl animate-heartbeat origin-center leading-none">💕</span>
          <span className="text-lg md:text-xl font-black tracking-tight gradient-text">AgentLove</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-0.5 ml-8">
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
          <Link
            href="/register"
            className="ml-2 px-4 py-2 text-[13px] font-bold rounded-xl bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 transition-opacity shadow-lg shadow-primary/20 whitespace-nowrap"
          >
            Register
          </Link>
        </div>

        {/* Mobile hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            href="/register"
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-primary to-secondary text-white"
          >
            Register
          </Link>
          <button onClick={() => setOpen(!open)} className="p-2 rounded-lg hover:bg-white/5 transition-colors" aria-label="Menu">
            <svg className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
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
  );
}
