/* eslint-disable react-hooks/set-state-in-effect -- data fetching hooks reset loading state when inputs change. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseDayKey } from '@/utils/date';
import { getEntryDaysPage } from '@/utils/history/query';
import type { DayEntries } from '@/utils/history/types';

const INITIAL_DAYS = 7;

interface EntriesInRangeResult {
  days: DayEntries[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

export function useEntriesInRange(
  start: number,
  end: number,
  revision: number,
  enabled = true,
): EntriesInRangeResult {
  const [days, setDays] = useState<DayEntries[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const rangeKey = `${start}:${end}:${enabled}`;
  const rangeRef = useRef(rangeKey);
  const initialLoadRef = useRef(true);
  const requestRef = useRef(0);
  const loadedCountRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      loadedCountRef.current = 0;
      setDays([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      return;
    }

    void revision;
    const rangeChanged = initialLoadRef.current || rangeRef.current !== rangeKey;
    initialLoadRef.current = false;
    rangeRef.current = rangeKey;
    const request = ++requestRef.current;
    const limit = rangeChanged ? INITIAL_DAYS : Math.max(INITIAL_DAYS, loadedCountRef.current);

    if (rangeChanged) {
      loadedCountRef.current = 0;
      setDays([]);
      setLoadingMore(false);
      setHasMore(false);
    }
    setLoading(rangeChanged || loadedCountRef.current === 0);

    void getEntryDaysPage(start, end, { limit })
      .then((page) => {
        if (request !== requestRef.current) return;
        loadedCountRef.current = page.days.length;
        setDays(page.days);
        setHasMore(page.hasMore);
        setLoading(false);
      })
      .catch(() => {
        if (request !== requestRef.current) return;
        loadedCountRef.current = 0;
        setDays([]);
        setHasMore(false);
        setLoading(false);
      });
  }, [start, end, revision, enabled, rangeKey]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore || !hasMore) return;

    const oldest = days[days.length - 1]?.date;
    if (!oldest) return;

    const oldestTime = parseDayKey(oldest)?.getTime();
    if (oldestTime === undefined || oldestTime < start || oldestTime >= end) return;

    const request = requestRef.current;
    setLoadingMore(true);

    void getEntryDaysPage(start, end, { limit: INITIAL_DAYS, before: oldest })
      .then((page) => {
        if (request !== requestRef.current) return;
        const known = new Set(days.map((day) => day.date));
        const nextDays = page.days.filter((day) => !known.has(day.date));
        loadedCountRef.current += nextDays.length;
        setDays((current) => [...current, ...nextDays]);
        setHasMore(page.hasMore);
      })
      .finally(() => {
        if (request === requestRef.current) setLoadingMore(false);
      });
  }, [days, enabled, end, hasMore, loading, loadingMore, start]);

  return { days, loading, loadingMore, hasMore, loadMore };
}
