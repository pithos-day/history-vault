import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useVaultOverview } from '../entrypoints/history/hooks/useVaultOverview';
import { dayKey, startOfDay } from '../utils/date';
import { db } from '../utils/db';
import type { VaultRevision } from '../utils/vault-events';

const first = new Date(2026, 9, 29, 10).getTime();
const second = new Date(2026, 9, 30, 10).getTime();
const third = new Date(2026, 9, 31, 10).getTime();

function revision(seq: number, days: string[] = [], reset = false): VaultRevision {
  return { seq, days, reset };
}

async function seed(date: number, views: number, pages: number) {
  await db.activity.put({ date: dayKey(date), views, pages });
}

describe('useVaultOverview', () => {
  beforeEach(async () => {
    await Promise.all([db.pages.clear(), db.visits.clear(), db.activity.clear(), db.meta.clear()]);
  });

  it('loads the summary once and patches only the changed days', async () => {
    await seed(first, 2, 1);
    await seed(second, 3, 2);

    const { result, rerender } = renderHook(
      ({ value }: { value: VaultRevision }) => useVaultOverview(value),
      { initialProps: { value: revision(0) } },
    );

    await waitFor(() => expect(result.current.activity.size).toBe(2));
    expect(result.current.bounds).toEqual({
      earliest: startOfDay(first).getTime(),
      latest: startOfDay(second).getTime(),
    });

    await seed(third, 4, 3);
    rerender({ value: revision(1, [dayKey(third)]) });

    await waitFor(() => expect(result.current.activity.size).toBe(3));
    expect(result.current.activity.get(dayKey(third))).toEqual({ views: 4, pages: 3 });
    expect(result.current.bounds?.latest).toBe(startOfDay(third).getTime());
  });

  it('removes a day that no longer has a summary row', async () => {
    await seed(first, 2, 1);
    await seed(second, 3, 2);

    const { result, rerender } = renderHook(
      ({ value }: { value: VaultRevision }) => useVaultOverview(value),
      { initialProps: { value: revision(0) } },
    );

    await waitFor(() => expect(result.current.activity.size).toBe(2));

    await db.activity.delete(dayKey(first));
    rerender({ value: revision(1, [dayKey(first)]) });

    await waitFor(() => expect(result.current.activity.size).toBe(1));
    expect(result.current.bounds?.earliest).toBe(startOfDay(second).getTime());
  });

  it('reloads the whole summary after a reset', async () => {
    await seed(first, 2, 1);

    const { result, rerender } = renderHook(
      ({ value }: { value: VaultRevision }) => useVaultOverview(value),
      { initialProps: { value: revision(0) } },
    );

    await waitFor(() => expect(result.current.activity.size).toBe(1));

    await seed(second, 3, 2);
    rerender({ value: revision(1, [], true) });

    await waitFor(() => expect(result.current.activity.size).toBe(2));
  });
});
