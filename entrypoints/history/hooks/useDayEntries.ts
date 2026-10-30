/* eslint-disable react-hooks/set-state-in-effect -- data fetching hooks reset loading state when inputs change. */
import { useEffect, useState } from 'react';
import { getDayEntries } from '@/utils/history/query';
import type { EntryGroup } from '@/utils/history/types';

export function useDayEntries(
  date: Date | number,
  revision: number,
): { entries: EntryGroup[]; loading: boolean } {
  const [entries, setEntries] = useState<EntryGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void revision;

    void getDayEntries(date)
      .then((value) => {
        if (!active) return;
        setEntries(value.entries);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setEntries([]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [date, revision]);

  return { entries, loading };
}
