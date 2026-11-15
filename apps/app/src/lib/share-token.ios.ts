// The iOS share extension ("Save to Fwd:Me" sheet) runs apart from the app and
// can't use its session. The signed-in app gives it a share token for this
// device, plus what it needs to reach the server, through the App Group they
// share (UserDefaults suite). See supabase/migrations/*_share_tokens.sql and
// targets/share/ShareViewController.swift.
import { ExtensionStorage } from '@bacons/apple-targets';
import { createShareToken, revokeShareToken } from '@fwdme/core';
import { supabase } from './supabase';

export const APP_GROUP = 'group.app.fwdme.mobile';
const storage = new ExtensionStorage(APP_GROUP);

const KEYS = {
  token: 'shareToken',
  user: 'shareTokenUser',
  // Set by the extension when the server refused the token (revoked, account gone).
  invalid: 'shareTokenInvalid',
  apiUrl: 'apiUrl',
  apiKey: 'apiKey',
  locale: 'locale',
} as const;

/** Called whenever the session or language changes (and on launch). */
export async function syncShareToken(userId: string | null, locale: string): Promise<void> {
  if (!userId) {
    // Signed out (or the session expired): the extension shows "open Fwd:Me and sign in".
    for (const key of Object.values(KEYS)) storage.remove(key);
    return;
  }
  storage.set(KEYS.apiUrl, process.env.EXPO_PUBLIC_SUPABASE_URL!);
  storage.set(KEYS.apiKey, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  storage.set(KEYS.locale, locale);
  const fresh = storage.get(KEYS.token) && storage.get(KEYS.user) === userId && storage.get(KEYS.invalid) !== '1';
  if (fresh) return;
  try {
    const token = await createShareToken(supabase, 'iPhone share sheet');
    storage.set(KEYS.token, token);
    storage.set(KEYS.user, userId);
    storage.remove(KEYS.invalid);
  } catch {
    // Try again next launch; the extension asks the user to open the app meanwhile.
  }
}

/** Before signing out: revoke this device's token while the session still works. */
export async function forgetShareToken(): Promise<void> {
  const token = storage.get(KEYS.token);
  if (token) await revokeShareToken(supabase, token).catch(() => {});
  for (const key of Object.values(KEYS)) storage.remove(key);
}
