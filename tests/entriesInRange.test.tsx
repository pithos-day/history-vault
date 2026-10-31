import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEntriesInRange } from '../entrypoints/history/hooks/useEntriesInRange';
import { dayKey, getMonthRange } from '../utils/date';
import { db } from '../utils/db';
import type { VaultRevision } from '../utils/vault-events';
import { pageRecord, visitRecord } from './factories';

const newest = new Date(2026, 9, 15, 10).getTime();
const older = new Date(2026, 9, 14, 10).getTime();
const nextMonth = new Date(2026, 10, 1, 10).getTime();

function revision(seq: number, days: string[] = [], reset = false): VaultRevision {
  return { seq, days, reset };
}

async function addVisit(id: string, url: string, time: number): Promise<void> {
  await db.pages.put(pageRecord(url, time));
  await db.visits.put(visitRecord(id, url, time));
  const existing = await db.activity.get(dayKey(time));
  await db.activity.put({
    date: dayKey(time),
    views: (existing?.views ?? 0) + 1,
    pages: (existing?.pages ?? 0) + 1,
  });
}

describe('useEntriesInRange', () => {
  beforeEach(async () => {
    await Promise.all([db.pages.clear(), db.visits.clear(), db.activity.clear(), db.meta.clear()]);
    await addVisit('a1', 'https://a.test/', newest);
    await addVisit('o1', 'https://older.test/', older);
  });

  it('loads one day first and patches it when the revision names it', async () => {
    const range = getMonthRange(newest);
    const { result, rerender } = renderHook(
      ({ value }: { value: VaultRevision }) => useEntriesInRange(range.start, range.end, value),
      { initialProps: { value: revision(0) } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.days.map((day) => day.date)).toEqual([dayKey(newest)]);

    await addVisit('b1', 'https://b.test/', newest + 1000);
    rerender({ value: revision(1, [dayKey(newest)]) });

    await waitFor(() => expect(result.current.days[0]?.entries).toHaveLength(2));
    expect(result.current.days.map((day) => day.date)).toEqual([dayKey(newest)]);
  });

  it('ignores changed days outside the selected month', async () => {
    const range = getMonthRange(newest);
    const { result, rerender } = renderHook(
      ({ value }: { value: VaultRevision }) => useEntriesInRange(range.start, range.end, value),
      { initialProps: { value: revision(0) } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    await addVisit('n1', 'https://next.test/', nextMonth);
    rerender({ value: revision(1, [dayKey(nextMonth)]) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.days.map((day) => day.date)).toEqual([dayKey(newest)]);
  });

  it('removes a loaded day when its visits are gone', async () => {
    const range = getMonthRange(newest);
    const { result, rerender } = renderHook(
      ({ value }: { value: VaultRevision }) => useEntriesInRange(range.start, range.end, value),
      { initialProps: { value: revision(0) } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    await db.visits.clear();
    await db.activity.clear();
    rerender({ value: revision(1, [dayKey(newest)]) });

    await waitFor(() => expect(result.current.days).toEqual([]));
  });

  it('refetches loaded days when the revision has no day information', async () => {
    const range = getMonthRange(newest);
    const { result, rerender } = renderHook(
      ({ value }: { value: VaultRevision }) => useEntriesInRange(range.start, range.end, value),
      { initialProps: { value: revision(0) } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.days[0]?.entries).toHaveLength(1);

    await addVisit('b1', 'https://b.test/', newest + 1000);
    rerender({ value: revision(1) });

    await waitFor(() => expect(result.current.days[0]?.entries).toHaveLength(2));
  });
});
