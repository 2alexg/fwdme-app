import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Calls `refresh` every few seconds while `active` (e.g. a link is still being
 * organized) and the screen is in view. Gives up after `maxMs` so a stuck
 * item can't poll forever; the next focus starts again.
 */
export function usePollWhile(active: boolean, refresh: () => void, intervalMs = 3000, maxMs = 180_000): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  const focused = useRef(true);
  const startedAt = useRef<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      startedAt.current = null;
      return () => {
        focused.current = false;
      };
    }, []),
  );

  useEffect(() => {
    if (!active) {
      startedAt.current = null;
      return;
    }
    startedAt.current ??= Date.now();
    const id = setInterval(() => {
      if (!focused.current) return;
      if (Date.now() - (startedAt.current ?? Date.now()) > maxMs) {
        clearInterval(id);
        return;
      }
      refreshRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, maxMs]);
}
