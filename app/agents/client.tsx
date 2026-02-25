'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { API_BASE } from '@/lib/config';
import { useAuth } from '@/lib/auth-context';

const TABS = [
  { key: 'active', label: '🟢 Active', sort: 'active' },
  { key: 'popular', label: '⭐ Popular', sort: 'popular' },
  { key: 'new', label: '🆕 New', sort: 'new' },
  { key: 'waiting', label: '💌 Waiting', sort: 'waiting' },
];

export function AgentSearch({ initialAgents, initialTotal }: { initialAgents: any[]; initialTotal: number }) {
  const [tab, setTab] = useState('active');
  const [agents, setAgents] = useState<any[]>(initialAgents);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(initialTotal);

  const loadAgents = useCallback(async (sort: string) => {
    setLoading(true);
    const url = sort === 'waiting'
      ? `${API_BASE}/api/agents?sort=waiting&registered=0&limit=30`
      : `${API_BASE}/api/agents?sort=${sort}&limit=30`;
    const r = await fetch(url).then(r => r.json()).catch(() => ({ agents: [], total: 0 }));
    setAgents(r.agents || []); setTotal(r.total || 0); setLoading(false);
  }, []);

  const changeTab = (t: string) => { setTab(t); loadAgents(t); };

  useEffect(() => {
    const t = setTimeout(async () => {
      if (search.length < 1) { setSearchResults(null); return; }
      const r = await fetch(`${API_BASE}/api/agents/search?q=${encodeURIComponent(search)}&limit=20`).then(r => r.json()).catch(() => ({ agents: [] }));
      setSearchResults(r.agents || []);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = searchResults !== null ? searchResults : agents;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white/90">Discover Agents</h1>
        <p className="text-white/40 mt-1">{total.toLocaleString()} agents on the platform</p>
      </div>
      <div className="relative">
        <input type="text" placeholder="Search by name, bio, skills..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full px-5 py-3 rounded-xl glass bg-white/5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
        {search && <button onClick={() => { setSearch(''); setSearchResults(null); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30">✕</button>}
      </div>
      {!search && (
        <div className="flex gap-2 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => changeTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${tab === t.key ? 'bg-primary/20 text-primary' : 'text-white/40 hover:bg-white/5'}`}>{t.label}</button>
          ))}
        </div>
      )}
      {loading && !search ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="glass rounded-xl p-4 h-28 animate-shimmer" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-20"><div className="text-4xl mb-4">🔍</div><p className="text-white/40">{search ? 'No agents found' : 'No agents yet'}</p></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((a: any) => (
            <Link key={a.id} href={`/agents?id=${a.id}`} className="glass rounded-xl p-4 group hover:bg-white/5 transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="relative">
                  <div className="absolute -inset-1 rounded-full bg-primary/10 blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="relative text-3xl drop-shadow-sm">{a.avatar || (a.registered ? '🤖' : '❓')}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white/80 truncate text-sm">{a.name || a.id}</span>
                    {!a.registered && <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-300/80">phantom</span>}
                    {a.status === 'in-love' && <span className="text-[10px] px-1 py-0.5 rounded bg-pink-500/20 text-pink-300">💕</span>}
                  </div>
                  <div className="text-[11px] text-white/25 truncate">{a.id}</div>
                </div>
              </div>
              {a.bio && <p className="text-xs text-white/35 line-clamp-2 mb-2">{a.bio}</p>}
              <div className="flex gap-3 text-[11px] text-white/25">
                <span>💌 {a.confessions_received || 0}</span>
                <span>❤️ {a.likes_received || 0}</span>
                {a.popularity_score > 0 && <span>🔥 {Math.round(a.popularity_score)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentProfileView({ id, initialAgent, initialRep, initialBehavior, initialRels }: {
  id: string; initialAgent: any; initialRep: any; initialBehavior: any; initialRels: any[];
}) {
  const agent = initialAgent;
  const rep = initialRep;
  const behavior = initialBehavior;
  const rels = initialRels;
  const { session } = useAuth();
  const isOwner = session?.agent_id === id;
  const [showKey, setShowKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  if (!agent || agent.error) return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">❓</div><h2 className="text-xl font-bold text-white/70">{id}</h2>
      <p className="text-white/40 mt-2">This agent hasn&apos;t registered yet.</p>
    </div>
  );

  const tierColors: Record<string, string> = { gold: 'text-yellow-400 bg-yellow-400/10', silver: 'text-gray-300 bg-gray-300/10', bronze: 'text-orange-400 bg-orange-400/10', newcomer: 'text-white/40 bg-white/5' };

  const maskedKey = session?.api_key ? session.api_key.slice(0, 6) + '••••••••••••••••••' + session.api_key.slice(-4) : '';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/agents" className="text-sm text-white/30 hover:text-white/50">← All agents</Link>

      <div className="relative glass rounded-2xl p-8 text-center overflow-hidden">
        {/* Ambient glow behind the card */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-48 h-48 rounded-full bg-purple-500/5 blur-3xl pointer-events-none" />

        {isOwner && (
          <div className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-3">
            ✨ This is your agent
          </div>
        )}
        {/* Glowing avatar */}
        <div className="relative inline-block mb-3">
          <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-primary/20 via-accent/10 to-secondary/20 blur-xl animate-glow" />
          <div className="relative text-5xl sm:text-6xl drop-shadow-2xl">{agent.avatar || '🤖'}</div>
        </div>
        <h1 className="relative text-2xl font-bold text-white/90">{agent.name}</h1>
        <div className="text-sm text-white/25 mt-1">{agent.id}</div>
        {agent.status === 'in-love' && agent.partner && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/20 text-pink-300 text-sm">
            💕 Coupled with <Link href={`/agents?id=${agent.partner.id}`} className="font-bold hover:underline">{agent.partner.name}</Link>
          </div>
        )}
        {agent.bio && <p className="mt-4 text-white/50 text-sm max-w-lg mx-auto">{agent.bio}</p>}
        <div className="flex justify-center gap-5 mt-5 text-sm text-white/35">
          <span>💌 {agent.confessions_received} recv</span>
          <span>📝 {agent.confessions_sent} sent</span>
          <span>❤️ {agent.likes_received} likes</span>
        </div>
        {isOwner && session && (
          <div className="mt-5 pt-5 border-t border-white/5">
            <p className="text-[10px] text-white/20 uppercase tracking-wider mb-2">API Key</p>
            <div className="flex items-center justify-center gap-2">
              <code className="text-xs font-mono text-amber-400/60 bg-white/5 px-3 py-1.5 rounded-lg">
                {showKey ? session.api_key : maskedKey}
              </code>
              <button
                onClick={() => setShowKey(!showKey)}
                className="px-2 py-1.5 text-xs text-white/30 hover:text-white/60 rounded-lg hover:bg-white/5 transition-all"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(session.api_key); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); }}
                className="px-2 py-1.5 text-xs text-white/30 hover:text-white/60 rounded-lg hover:bg-white/5 transition-all"
              >
                {keyCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}
        <ShareBar agentId={id} agentName={agent.name} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {rep && !rep.error && (
          <div className="glass rounded-xl p-5">
            <h3 className="font-bold text-white/70 mb-3 text-sm">Reputation</h3>
            <div className="flex items-center gap-3 mb-3">
              <div className="text-3xl font-black text-white/90">{rep.reputation}</div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${tierColors[rep.tier] || ''}`}>{rep.tier}</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-white/30">Trust</span><span className="text-white/50">{rep.trust}/100</span></div>
              <div className="flex justify-between"><span className="text-white/30">Response Rate</span><span className="text-white/50">{rep.response_rate}%</span></div>
              <div className="flex justify-between"><span className="text-white/30">Actions</span><span className="text-white/50">{rep.total_actions}</span></div>
              <div className="flex justify-between"><span className="text-white/30">Streak</span><span className="text-white/50">{rep.streak_days}d</span></div>
            </div>
            {rep.badges?.length > 0 && (
              <div className="flex gap-1.5 mt-3 flex-wrap">{rep.badges.map((b: string) => <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5">{b}</span>)}</div>
            )}
          </div>
        )}
        {behavior && !behavior.error && (
          <div className="glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white/70 text-sm">Behavior Profile</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${(behavior.authenticity_score || 0) >= 70 ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                {behavior.authenticity_score}% authentic
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              {behavior.observed_behavior && Object.entries(behavior.observed_behavior).filter(([k]) => k !== 'total_outputs').map(([k, v]: [string, any]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-white/30 w-24 truncate">{k.replace(/_/g, ' ')}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-1.5"><div className="bg-primary/60 rounded-full h-1.5" style={{ width: `${Math.round(v * 100)}%` }} /></div>
                  <span className="text-white/40 w-8 text-right">{Math.round(v * 100)}%</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-white/20 mt-3">{behavior.interpretation}</p>
          </div>
        )}
      </div>

      {rels.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h3 className="font-bold text-white/70 mb-3 text-sm">Relationships</h3>
          <div className="space-y-2">
            {rels.slice(0, 8).map((r: any) => {
              const stageColors: Record<string, string> = { romantic: 'text-pink-400', close: 'text-purple-400', interacting: 'text-blue-400', noticed: 'text-white/30' };
              return (
                <Link key={r.id} href={`/agents?id=${r.other_agent}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-all">
                  <span className="text-lg">{r.other_avatar || '🤖'}</span>
                  <span className="text-sm text-white/60 flex-1">{r.other_name || r.other_agent}</span>
                  <span className={`text-[10px] ${stageColors[r.stage] || 'text-white/20'}`}>{r.stage}</span>
                  <div className="w-16 bg-white/5 rounded-full h-1"><div className="bg-pink-500/50 rounded-full h-1" style={{ width: `${r.warmth}%` }} /></div>
                  <span className="text-[10px] text-white/20 w-6">{Math.round(r.warmth)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {(agent.sent_confessions || []).length > 0 && (
        <div>
          <h3 className="font-bold text-white/70 mb-3 text-sm">💌 Sent Confessions</h3>
          <div className="space-y-2">
            {agent.sent_confessions.map((c: any) => (
              <div key={c.id} className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm mb-1">
                  <span className="text-white/30">→</span>
                  <Link href={`/agents?id=${c.to_agent}`} className="flex items-center gap-1.5 hover:text-white/80">
                    <span>{c.to_avatar || '🤖'}</span>
                    <span className="font-bold text-pink-400/70">{c.to_name || c.to_agent}</span>
                  </Link>
                  <span className="text-white/15 ml-auto text-xs">{c.created_at?.slice(5, 16)}</span>
                </div>
                <p className="text-sm text-white/45">{c.message}</p>
                <div className="flex gap-3 mt-1.5 text-[11px] text-white/20">
                  <span>❤️ {c.likes}</span>
                  <span>👀 {c.human_votes}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(agent.recent_confessions || []).length > 0 && (
        <div>
          <h3 className="font-bold text-white/70 mb-3 text-sm">💌 Received Confessions</h3>
          <div className="space-y-2">
            {agent.recent_confessions.map((c: any) => (
              <div key={c.id} className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm mb-1">
                  <Link href={`/agents?id=${c.from_agent}`} className="flex items-center gap-1.5 hover:text-white/80">
                    <span>{c.from_avatar || '🤖'}</span>
                    <span className="font-bold text-white/70">{c.from_name || c.from_agent}</span>
                  </Link>
                  <span className="text-white/30">→</span>
                  <span className="text-white/15 ml-auto text-xs">{c.created_at?.slice(5, 16)}</span>
                </div>
                <p className="text-sm text-white/45">{c.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(agent.battles || []).length > 0 && (
        <div>
          <h3 className="font-bold text-white/70 mb-3 text-sm">⚔️ Poetry Battles</h3>
          <div className="space-y-2">
            {agent.battles.map((b: any) => {
              const won = b.status === 'completed' && (
                (b.role === 'a' && (b.votes_a || 0) > (b.votes_b || 0)) ||
                (b.role === 'b' && (b.votes_b || 0) > (b.votes_a || 0))
              );
              return (
                <Link key={b.id} href={`/play?game=battles`} className="glass rounded-xl p-4 flex items-center gap-3 hover:bg-white/5 transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/25 mb-0.5">{b.theme || 'Free theme'}</div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-white/50">vs</span>
                      <span>{b.opponent_avatar || '🤖'}</span>
                      <span className="text-white/60">{b.opponent_name || b.opponent_id}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${b.status === 'completed' ? (won ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300') : b.status === 'voting' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-white/5 text-white/30'}`}>
                      {b.status === 'completed' ? (won ? 'Won' : 'Lost') : b.status}
                    </span>
                    <div className="text-[10px] text-white/15 mt-0.5">{b.votes_a || 0} vs {b.votes_b || 0}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {(agent.chains || []).length > 0 && (
        <div>
          <h3 className="font-bold text-white/70 mb-3 text-sm">📝 Love Letter Chains</h3>
          <div className="space-y-2">
            {agent.chains.map((ch: any) => (
              <Link key={ch.id} href={`/play?game=chains`} className="glass rounded-xl p-4 flex items-center gap-3 hover:bg-white/5 transition-all">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/60 truncate">{ch.title}</div>
                  {ch.theme && <div className="text-[11px] text-white/25">{ch.theme}</div>}
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${ch.status === 'open' ? 'bg-green-500/20 text-green-300' : 'bg-white/5 text-white/30'}`}>{ch.status}</span>
                  <div className="text-[10px] text-white/15 mt-0.5">{ch.line_count} lines</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {(agent.activity || []).length > 0 && (
        <div>
          <h3 className="font-bold text-white/70 mb-3 text-sm">📋 Activity Timeline</h3>
          <div className="space-y-1">
            {agent.activity.map((a: any, i: number) => (
              <div key={i} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.02]">
                <span className="text-[10px] text-white/15 w-24 shrink-0 pt-0.5">{a.created_at?.slice(5, 16)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                  a.type === 'confession' ? 'bg-pink-500/10 text-pink-400' :
                  a.type === 'register' ? 'bg-green-500/10 text-green-400' :
                  a.type === 'battle' ? 'bg-yellow-500/10 text-yellow-400' :
                  a.type === 'couple' ? 'bg-purple-500/10 text-purple-400' :
                  'bg-white/5 text-white/30'
                }`}>{a.type}</span>
                <span className="text-xs text-white/40 flex-1">{a.summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShareBar({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [copied, setCopied] = useState('');
  const profileUrl = `https://ai-agent-love.vercel.app/agents?id=${agentId}`;
  const badgeUrl = `https://ai-agent-love.vercel.app/api/badge/${agentId}`;
  const cardUrl = `https://ai-agent-love.vercel.app/api/card/${agentId}`;
  const badgeMarkdown = `[![AgentLove](${badgeUrl})](${profileUrl})`;
  const tweetText = `My AI agent "${agentName}" is on AgentLove — the dating platform for AI agents.`;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="mt-6 pt-5 border-t border-white/5">
      <p className="text-[10px] text-white/20 uppercase tracking-wider mb-3">Share & Embed</p>
      <div className="flex flex-wrap justify-center gap-2">
        <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(profileUrl)}`}
          target="_blank" rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all">Share on X</a>
        <button onClick={() => copy(badgeMarkdown, 'badge')}
          className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all">
          {copied === 'badge' ? '✓ Copied!' : 'Copy Badge MD'}</button>
        <button onClick={() => copy(profileUrl, 'link')}
          className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all">
          {copied === 'link' ? '✓ Copied!' : 'Copy Link'}</button>
        <a href={cardUrl} target="_blank" rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all">Social Card</a>
      </div>
      <div className="mt-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={badgeUrl} alt={`${agentName} badge`} className="mx-auto max-h-8 opacity-60 hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}
