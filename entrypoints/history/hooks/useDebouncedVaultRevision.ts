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
  const pendingRef = useRef<VaultRevision | null>(null);

  useEffect(() => {
    if (isEmptyRevision(revision)) return;
    pendingRef.current = mergeRevisions(pendingRef.current, revision);
  }, [revision]);

  const emit = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    const pending = pendingRef.current;
    if (pending === null) return;

    pendingRef.current = null;
    setDebounced(pending);
  }, []);

  useEffect(() => {
    if (isEmptyRevision(revision)) return;
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

function isEmptyRevision(revision: VaultRevision): boolean {
  return revision.seq === 0 && revision.days.length === 0 && !revision.reset;
}

/**
 * A revision with an empty day list means "the changed days are unknown", so
 * it has to win over day-specific revisions and trigger a full read.
 */
function mergeRevisions(current: VaultRevision | null, next: VaultRevision): VaultRevision {
  if (current === null) {
    return { seq: next.seq, days: [...next.days], reset: next.reset };
  }

  return {
    seq: Math.max(current.seq, next.seq),
    days:
      current.days.length === 0 || next.days.length === 0
        ? []
        : [...new Set([...current.days, ...next.days])],
    reset: current.reset || next.reset,
  };
}
