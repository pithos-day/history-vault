/* eslint-disable react-hooks/set-state-in-effect -- data fetching hooks reset loading state when inputs change. */
import { useEffect, useState } from 'react';
import { getRangeStats } from '@/utils/history/query';
import type { RangeStats } from '@/utils/history/types';
import type { VaultRevision } from '@/utils/vault-events';

export function useRangeStats(
  start: number,
  end: number,
  granularity: 'day' | 'hour',
  revision: VaultRevision,
  enabled = true,
): { stats: RangeStats | null; loading: boolean; error: string | null } {
  const [stats, setStats] = useState<RangeStats | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStats(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    // Any vault change can alter the range stats, so re-run when the revision
    // changes even though its value is not used by the query.
    void revision;
    setError(null);

    void getRangeStats(start, end, granularity)
      .then((value) => {
        if (!active) return;
        setStats(value);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [start, end, granularity, revision, enabled]);

  return { stats, loading, error };
}
