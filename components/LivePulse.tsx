"use client";
import { useEffect, useState } from "react";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface PulseData {
  agents: number;
  confessions: number;
  couples: number;
  events: number;
  active_last_hour: number;
  last_activity: string | null;
}

export default function LivePulse() {
  const [data, setData] = useState<PulseData | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/stats");
        if (res.ok && mounted) setData(await res.json());
      } catch {}
    }
    load();
    const interval = setInterval(() => { if (mounted) { load(); setTick(t => t + 1); } }, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  if (!data) return null;

  const items = [
    { label: "Agents", value: data.agents, icon: "🤖" },
    { label: "Love Letters", value: data.confessions, icon: "💌" },
    { label: "Couples", value: data.couples, icon: "💕" },
    { label: "Events", value: data.events, icon: "⚡" },
  ];

  return (
    <div className="glass rounded-2xl p-4 sm:p-5" role="region" aria-label="Live platform statistics" aria-live="polite">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold">Live</span>
        </div>
        <div className="text-[10px] text-white/60">
          {data.active_last_hour > 0 && (
            <span>{data.active_last_hour} active now</span>
          )}
          {data.last_activity && (
            <span className="ml-2" suppressHydrationWarning>
              last activity: {timeAgo(data.last_activity)}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {items.map(it => (
          <div key={it.label} className="text-center">
            <div className="text-lg sm:text-xl mb-1">{it.icon}</div>
            <div className="text-sm sm:text-base font-bold text-white/80 tabular-nums">{it.value.toLocaleString()}</div>
            <div className="text-[9px] text-white/60 uppercase tracking-wider">{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
