// Web: browsers can't share into the app, so there is never a pending share.
import type { IncomingShare } from '@fwdme/core';

export interface PendingShare {
  payloads: IncomingShare[];
  clear: () => void;
}

export function useIncomingShareState(): PendingShare {
  return { payloads: [], clear: () => {} };
}
