import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { addCalendarDays, dayKey, getMonthRange, startOfDay } from '../utils/date';
import { db } from '../utils/db';
import { ingestHistoryItem } from '../utils/history/collect';
import {
  deleteDayFromVault,
  deleteUrlFromVault,
  deleteUrlVisitsInInclusiveWindow,
  getCalendarActivity,
  getCalendarActivityForDates,
  getDayEntriesForDates,
  getEntryDaysPage,
  removeRedirectedVisits,
} from '../utils/history/query';

const { getVisits } = vi.hoisted(() => ({ getVisits: vi.fn() }));

vi.mock('wxt/browser', () => ({
  browser: {
    history: { getVisits },
    storage: {
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
    },
    runtime: { getURL: (path: string) => `chrome-extension://test${path}` },
  },
}));

function visit(id: string, visitTime: number): Browser.history.VisitItem {
  return {
    id: 'page',
    visitId: id,
    visitTime,
    transition: 'link',
    referringVisitId: '0',
    isLocal: true,
  };
}

function item(url: string, title: string, lastVisitTime: number, visitCount: number) {
  return { id: url, url, title, lastVisitTime, visitCount };
}

async function ingest(url: string, title: string, visits: Browser.history.VisitItem[]) {
  getVisits.mockResolvedValue(visits);
  return ingestHistoryItem(item(url, title, visits.at(-1)?.visitTime ?? 0, visits.length), {
    source: 'live',
    notify: false,
  });
}

describe('day activity summary', () => {
  beforeEach(async () => {
    await Promise.all([db.pages.clear(), db.visits.clear(), db.activity.clear(), db.meta.clear()]);
    getVisits.mockReset();
  });

  it('rolls visits up into one calendar row per day', async () => {
    const day = new Date(2026, 9, 15, 10).getTime();
    await ingest('https://a.test/', 'A', [visit('a1', day), visit('a2', day + 1000)]);
    await ingest('https://b.test/', 'B', [visit('b1', day + 2000)]);

    const activity = await getCalendarActivity(
      startOfDay(day).getTime(),
      addCalendarDays(day, 1).getTime(),
    );

    expect(activity.get(dayKey(day))).toEqual({ views: 3, pages: 2 });
  });

  it('pages through days from newest to oldest without reading the whole month', async () => {
    const older = new Date(2026, 9, 14, 9).getTime();
    const newer = new Date(2026, 9, 15, 9).getTime();
    await ingest('https://older.test/', 'Older', [visit('older', older)]);
    await ingest('https://newer.test/', 'Newer', [visit('newer', newer)]);

    const range = getMonthRange(newer);
    const first = await getEntryDaysPage(range.start, range.end, { limit: 1 });
    expect(first.days.map((day) => day.date)).toEqual([dayKey(newer)]);
    expect(first.days[0]?.entries[0]?.title).toBe('Newer');
    expect(first.hasMore).toBe(true);

    const second = await getEntryDaysPage(range.start, range.end, {
      limit: 1,
      before: dayKey(newer),
    });
    expect(second.days.map((day) => day.date)).toEqual([dayKey(older)]);
    expect(second.hasMore).toBe(false);
  });

  it('reads only the calendar days named by a revision', async () => {
    const older = new Date(2026, 9, 14, 9).getTime();
    const newer = new Date(2026, 9, 15, 9).getTime();
    await ingest('https://older.test/', 'Older', [visit('older', older)]);
    await ingest('https://newer.test/', 'Newer', [visit('newer', newer)]);

    const changed = await getCalendarActivityForDates([dayKey(newer), '2026-10-01']);

    expect([...changed.entries()]).toEqual([[dayKey(newer), { views: 1, pages: 1 }]]);
  });

  it('rebuilds only the requested days for a revision update', async () => {
    const older = new Date(2026, 9, 14, 9).getTime();
    const newer = new Date(2026, 9, 15, 9).getTime();
    await ingest('https://older.test/', 'Older', [visit('older', older)]);
    await ingest('https://newer.test/', 'Newer', [visit('newer', newer)]);

    const changed = await getDayEntriesForDates([dayKey(newer), '2026-10-01']);
    expect(changed.map((day) => day.date)).toEqual([dayKey(newer)]);
    expect(changed[0]?.entries[0]?.title).toBe('Newer');

    await deleteDayFromVault(newer);
    expect(await getDayEntriesForDates([dayKey(newer)])).toEqual([]);
  });

  it('updates the summary when visits are removed', async () => {
    const ten = new Date(2026, 9, 15, 10).getTime();
    await ingest('https://a.test/', 'A', [visit('a1', ten), visit('a2', ten + 300_000)]);
    await ingest('https://b.test/', 'B', [visit('b1', ten + 1000)]);

    await deleteUrlVisitsInInclusiveWindow('https://a.test/', ten + 200_000, ten + 400_000);
    let activity = await getCalendarActivity(
      startOfDay(ten).getTime(),
      addCalendarDays(ten, 1).getTime(),
    );
    expect(activity.get(dayKey(ten))).toEqual({ views: 2, pages: 2 });

    await deleteUrlFromVault('https://a.test/');
    activity = await getCalendarActivity(
      startOfDay(ten).getTime(),
      addCalendarDays(ten, 1).getTime(),
    );
    expect(activity.get(dayKey(ten))).toEqual({ views: 1, pages: 1 });

    await deleteDayFromVault(ten);
    expect(await db.activity.count()).toBe(0);
  });

  it('removes a redirect intermediate that was written before its marker', async () => {
    const ten = new Date(2026, 9, 15, 10).getTime();
    await ingest('https://redirect.test/', 'Redirect', [visit('redirect', ten)]);
    await ingest('https://target.test/', 'Target', [visit('target', ten + 5)]);

    await db.meta.put({
      key: 'redirectMarkers',
      value: [{ url: 'https://redirect.test/', from: ten - 1000, to: ten + 2000 }],
    });
    await removeRedirectedVisits(ten - 1000, ten + 2000);

    expect(await db.visits.where('url').equals('https://redirect.test/').count()).toBe(0);
    expect(await db.pages.get('https://redirect.test/')).toBeUndefined();
    expect(await db.visits.where('url').equals('https://target.test/').count()).toBe(1);
  });
});
