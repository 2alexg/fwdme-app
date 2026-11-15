// iOS/Android: what the user shared into Fwd:Me from another app. The OS
// share arrives while the app is starting or coming to the foreground, so
// re-read on both. Payloads stay until clear() so a share made while signed
// out is still there after signing in.
//
// Android hands the original share to the app again when it brings back the
// task the share opened (from Recents, or from the launcher after the app was
// closed in the background). clear() remembers the last share it handled,
// and that share is ignored when it comes back, so reopening the app shows
// the library instead of the share screen again.
import { shareKey, type IncomingShare } from '@fwdme/core';
import { clearSharedPayloads, getSharedPayloads } from 'expo-sharing';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { PendingShare } from './incoming-share';
import { authStorage } from './storage';

const HANDLED_KEY = 'fwdme.lastHandledShare';

function handledKey(): string | null {
  try {
    return authStorage.getItem(HANDLED_KEY);
  } catch {
    return null;
  }
}

function clearNative() {
  try {
    clearSharedPayloads();
  } catch {
    // Nothing to clear.
  }
}

function read(): IncomingShare[] {
  let payloads: IncomingShare[];
  try {
    payloads = getSharedPayloads();
  } catch {
    return [];
  }
  if (payloads.length > 0 && shareKey(payloads) === handledKey()) {
    clearNative();
    return [];
  }
  return payloads;
}

export function useIncomingShareState(): PendingShare {
  const [payloads, setPayloads] = useState<IncomingShare[]>(read);
  const current = useRef(payloads);
  useEffect(() => {
    current.current = payloads;
  }, [payloads]);

  const refresh = useCallback(() => {
    const next = read();
    setPayloads((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    const links = Linking.addEventListener('url', refresh);
    return () => {
      appState.remove();
      links.remove();
    };
  }, [refresh]);

  const clear = useCallback(() => {
    if (current.current.length > 0) {
      try {
        authStorage.setItem(HANDLED_KEY, shareKey(current.current));
      } catch {
        // Worst case the share screen shows again ("already saved").
      }
    }
    clearNative();
    setPayloads([]);
  }, []);

  return { payloads, clear };
}
