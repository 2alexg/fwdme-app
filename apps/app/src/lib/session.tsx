import type { Session } from '@supabase/supabase-js';
import { getMyProfile, type Profile } from '@scrapbook/core';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

interface SessionState {
  session: Session | null;
  profile: Profile | null;
  /** True until the stored session (and its profile) has been read. */
  loading: boolean;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: Profile) => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    setProfile(await getMyProfile(supabase).catch(() => null));
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await refreshProfile();
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (!next) setProfile(null);
      // Supabase advises against awaiting other calls inside this callback.
      else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') setTimeout(refreshProfile, 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  return (
    <SessionContext.Provider value={{ session, profile, loading, refreshProfile, setProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
