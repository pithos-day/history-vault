import { useCallback, useEffect, useRef, useState } from 'react';
import type { VaultRevision } from '@/utils/vault-events';

/**
 * Batches rapid revision updates without losing which days changed. Import
 * bumps once per processed day, so keeping only the latest revision would
 * leave earlier days in the list stale. Hidden tabs keep collecting changes
 * and flush them once the page is visible again, so background tabs do not
 * run database queries nobody is looking at.
 */
export function useDebouncedVaultRevision(revision: VaultRevision, delayMs: number): VaultRevision {
  const [debounced, setDebounced] = useState<VaultRevision>(revision);
  const pendingRef = useRef<VaultRevision>(revision);
  const emittedSeqRef = useRef(revision.seq);

  useEffect(() => {
    if (revision.seq === 0) return;
    pendingRef.current = mergeRevisions(pendingRef.current, revision);
  }, [revision]);

  const emit = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    const pending = pendingRef.current;
    if (pending.seq <= emittedSeqRef.current) return;

    emittedSeqRef.current = pending.seq;
    pendingRef.current = { seq: pending.seq, days: [], reset: false };
    setDebounced(pending);
  }, []);

  useEffect(() => {
    if (revision.seq === 0) return;
    const timer = setTimeout(emit, delayMs);
    return () => clearTimeout(timer);
  }, [revision, delayMs, emit]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') emit();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [emit]);

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
