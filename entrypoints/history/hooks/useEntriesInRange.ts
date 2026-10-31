/* eslint-disable react-hooks/set-state-in-effect -- data fetching hooks reset loading state when inputs change. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { dayKey, parseDayKey } from '@/utils/date';
import { getDayEntriesForDates, getEntryDaysPage } from '@/utils/history/query';
import type { DayEntries } from '@/utils/history/types';
import type { VaultRevision } from '@/utils/vault-events';

const INITIAL_DAYS = 1;
const PAGE_DAYS = 7;

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
  revision: VaultRevision,
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
  const daysRef = useRef<DayEntries[]>([]);
  const appliedRevisionRef = useRef<VaultRevision>(revision);
  const loadingFullRef = useRef(false);
  const pendingDaysRef = useRef<Set<string> | 'all' | null>(null);

  const commitDays = useCallback((next: DayEntries[]) => {
    daysRef.current = next;
    setDays(next);
  }, []);

  const applyChangedDays = useCallback(
    async (dates: readonly string[], token: number) => {
      const startKey = dayKey(start);
      const endKey = dayKey(end - 1);
      const inRange = dates.filter((date) => date >= startKey && date <= endKey);
      if (inRange.length === 0) return;

      const entries = await getDayEntriesForDates(inRange);
      if (token !== requestRef.current) return;

      const current = daysRef.current;
      if (current.length === 0) return;

      const changed = new Map(entries.map((day) => [day.date, day]));
      const oldest = current[current.length - 1]?.date ?? '';
      const next = new Map(current.map((day) => [day.date, day]));

      for (const date of inRange) {
        const day = changed.get(date);
        if (day) {
          if (next.has(date) || date >= oldest) next.set(date, day);
        } else {
          next.delete(date);
        }
      }

      const merged = [...next.values()].sort((left, right) => right.date.localeCompare(left.date));
      if (
        merged.length === current.length &&
        merged.every((day, index) => day === current[index])
      ) {
        return;
      }

      commitDays(merged);
    },
    [commitDays, start, end],
  );

  const flushPendingDays = useCallback(
    async (token: number) => {
      loadingFullRef.current = false;
      const pending = pendingDaysRef.current;
      pendingDaysRef.current = null;
      if (pending === null || token !== requestRef.current) return;

      const dates = pending === 'all' ? daysRef.current.map((day) => day.date) : [...pending];
      if (dates.length > 0) await applyChangedDays(dates, token).catch(() => undefined);
    },
    [applyChangedDays],
  );

  useEffect(() => {
    if (!enabled) {
      requestRef.current += 1;
      loadingFullRef.current = false;
      pendingDaysRef.current = null;
      appliedRevisionRef.current = revision;
      commitDays([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      return;
    }

    const rangeChanged = initialLoadRef.current || rangeRef.current !== rangeKey;
    const reset =
      revision.reset && revision !== appliedRevisionRef.current && !loadingFullRef.current;
    // An empty range has no loaded days to patch, so a new revision (for
    // example the first visit of the month) has to start the page load again.
    const reloadEmpty =
      !rangeChanged &&
      !reset &&
      !loadingFullRef.current &&
      revision !== appliedRevisionRef.current &&
      daysRef.current.length === 0 &&
      (revision.days.length === 0 || hasDayInRange(revision.days, start, end));

    if (!rangeChanged && !reset && !reloadEmpty) {
      if (revision === appliedRevisionRef.current) return;
      appliedRevisionRef.current = revision;

      if (loadingFullRef.current) {
        pendingDaysRef.current = revision.reset
          ? 'all'
          : mergePendingDays(pendingDaysRef.current, revision.days);
        return;
      }

      const dates =
        revision.days.length > 0 ? revision.days : daysRef.current.map((day) => day.date);
      if (dates.length === 0) return;

      void applyChangedDays([...new Set(dates)], requestRef.current).catch(() => undefined);
      return;
    }

    initialLoadRef.current = false;
    rangeRef.current = rangeKey;
    appliedRevisionRef.current = revision;
    const request = ++requestRef.current;
    loadingFullRef.current = true;
    pendingDaysRef.current = null;

    commitDays([]);
    setLoadingMore(false);
    setHasMore(false);
    setLoading(true);

    void getEntryDaysPage(start, end, { limit: INITIAL_DAYS })
      .then(async (page) => {
        if (request !== requestRef.current) return;
        commitDays(page.days);
        setHasMore(page.hasMore);
        setLoading(false);
        await flushPendingDays(request);
      })
      .catch(() => {
        if (request !== requestRef.current) return;
        loadingFullRef.current = false;
        pendingDaysRef.current = null;
        commitDays([]);
        setHasMore(false);
        setLoading(false);
      });
  }, [start, end, revision, enabled, rangeKey, applyChangedDays, commitDays, flushPendingDays]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore || !hasMore) return;

    const oldest = daysRef.current[daysRef.current.length - 1]?.date;
    if (!oldest) return;

    const oldestTime = parseDayKey(oldest)?.getTime();
    if (oldestTime === undefined || oldestTime < start || oldestTime >= end) return;

    const request = requestRef.current;
    setLoadingMore(true);

    void getEntryDaysPage(start, end, { limit: PAGE_DAYS, before: oldest })
      .then((page) => {
        if (request !== requestRef.current) return;
        const known = new Set(daysRef.current.map((day) => day.date));
        const nextDays = page.days.filter((day) => !known.has(day.date));
        commitDays(
          [...daysRef.current, ...nextDays].sort((left, right) =>
            right.date.localeCompare(left.date),
          ),
        );
        setHasMore(page.hasMore);
      })
      .finally(() => {
        if (request === requestRef.current) setLoadingMore(false);
      });
  }, [commitDays, enabled, end, hasMore, loading, loadingMore, start]);

  return { days, loading, loadingMore, hasMore, loadMore };
}

function mergePendingDays(
  pending: Set<string> | 'all' | null,
  days: readonly string[],
): Set<string> | 'all' {
  if (pending === 'all') return pending;
  if (days.length === 0) return 'all';

  const next = pending ?? new Set<string>();
  for (const day of days) next.add(day);
  return next;
}

function hasDayInRange(days: readonly string[], start: number, end: number): boolean {
  return days.some((day) => {
    const time = parseDayKey(day)?.getTime();
    return time !== undefined && time >= start && time < end;
  });
}
