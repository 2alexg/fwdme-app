// iOS/Android: what the user shared into Fwd:Me from another app. The OS
// share arrives while the app is starting or coming to the foreground, so
// re-read on both. Payloads stay until clear() so a share made while signed
// out is still there after signing in.
import type { IncomingShare } from '@fwdme/core';
import { clearSharedPayloads, getSharedPayloads } from 'expo-sharing';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { PendingShare } from './incoming-share';

function read(): IncomingShare[] {
  try {
    return getSharedPayloads();
  } catch {
    return [];
  }
}

export function useIncomingShareState(): PendingShare {
  const [payloads, setPayloads] = useState<IncomingShare[]>(read);

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
    try {
      clearSharedPayloads();
    } catch {
      // Nothing to clear.
    }
    setPayloads([]);
  }, []);

  return { payloads, clear };
}
