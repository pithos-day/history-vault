import { useEffect, useRef, useState } from 'react';
import type { VaultRevision } from '@/utils/vault-events';

/**
 * Batches rapid revision updates without losing which days changed. Import
 * bumps once per processed day, so keeping only the latest revision would
 * leave earlier days in the list stale.
 */
export function useDebouncedVaultRevision(revision: VaultRevision, delayMs: number): VaultRevision {
  const [debounced, setDebounced] = useState<VaultRevision>(revision);
  const pendingRef = useRef<VaultRevision>(revision);

  useEffect(() => {
    if (revision.seq === 0) return;

    pendingRef.current = mergeRevisions(pendingRef.current, revision);
    const pending = pendingRef.current;
    const timer = setTimeout(() => {
      setDebounced(pending);
      pendingRef.current = { seq: pending.seq, days: [], reset: false };
    }, delayMs);

    return () => clearTimeout(timer);
  }, [revision, delayMs]);

  return debounced;
}

function mergeRevisions(current: VaultRevision, next: VaultRevision): VaultRevision {
  if (next.seq <= current.seq) return current;

  return {
    seq: next.seq,
    days: [...new Set([...current.days, ...next.days])],
    reset: current.reset || next.reset,
  };
}
