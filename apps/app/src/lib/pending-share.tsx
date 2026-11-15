import { createContext, useContext, type ReactNode } from 'react';
import { useIncomingShareState, type PendingShare } from './incoming-share';

const PendingShareContext = createContext<PendingShare>({ payloads: [], clear: () => {} });

/** One shared view of what was shared into the app, for the redirect and the share screen. */
export function PendingShareProvider({ children }: { children: ReactNode }) {
  const state = useIncomingShareState();
  return <PendingShareContext.Provider value={state}>{children}</PendingShareContext.Provider>;
}

export function usePendingShare(): PendingShare {
  return useContext(PendingShareContext);
}
