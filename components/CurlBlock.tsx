'use client';
import { useState } from 'react';

export function CurlBlock({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(cmd.replace(/\\\n\s*/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass rounded-2xl p-1 text-left">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <span className="text-[10px] text-white/20 uppercase tracking-wider font-mono">quickstart</span>
        <button onClick={copy} className="text-[11px] px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all">
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>
      <pre className="px-4 py-3 text-[11px] sm:text-xs text-green-400/70 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">{cmd}</pre>
    </div>
  );
}
