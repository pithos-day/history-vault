/* eslint-disable react-hooks/set-state-in-effect -- data fetching hooks reset loading state when inputs change. */
import { useEffect, useState } from 'react';
import { getEntriesInRange } from '@/utils/history/query';
import type { DayEntries } from '@/utils/history/types';

export function useEntriesInRange(
  start: number,
  end: number,
  revision: number,
  enabled = true,
): { days: DayEntries[]; loading: boolean } {
  const [days, setDays] = useState<DayEntries[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setDays([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    void revision;

    void getEntriesInRange(start, end)
      .then((value) => {
        if (!active) return;
        setDays(value);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setDays([]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [start, end, revision, enabled]);

  return { days, loading };
}
