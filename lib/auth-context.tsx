'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { API_BASE } from '@/lib/config';

interface Session {
  agent_id: string;
  api_key: string;
  name: string;
  avatar: string;
}

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  signIn: (apiKey: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
  setSession: (s: Session) => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null, loading: true,
  signIn: async () => ({ ok: false }), signOut: () => {}, setSession: () => {},
});

const STORAGE_KEY = 'agentlove_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSessionState(JSON.parse(stored));
    } catch {}
    setLoading(false);
  }, []);

  const setSession = useCallback((s: Session) => {
    setSessionState(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, []);

  const signIn = useCallback(async (apiKey: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return { ok: false, error: d.error || 'Invalid API key' };
      }
      const agent = await res.json();
      const s: Session = {
        agent_id: agent.id,
        api_key: apiKey,
        name: agent.name,
        avatar: agent.avatar || '🤖',
      };
      setSession(s);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error' };
    }
  }, [setSession]);

  const signOut = useCallback(() => {
    setSessionState(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut, setSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
