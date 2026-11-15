// iOS/Android: the confirmation email opens fwdme://#access_token=…; turn
// that into a signed-in session so people don't have to type their password.
import { parseAuthLink } from '@fwdme/core';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { supabase } from './supabase';

export function useAuthLinks(onExpired: () => void): void {
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      const link = parseAuthLink(url);
      if (link?.kind === 'session') {
        supabase.auth
          .setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
          .catch(() => onExpired());
      } else if (link?.kind === 'error') {
        onExpired();
      }
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [onExpired]);
}

/** Must match an entry in Supabase → Authentication → URL Configuration → Redirect URLs. */
export function emailRedirectUrl(): string {
  return 'fwdme://';
}
