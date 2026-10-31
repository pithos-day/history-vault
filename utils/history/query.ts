import { addDays, dayKey, getDayRange, parseDayKey, startOfDay } from '../date';
import { db } from '../db';
import { bumpVaultRevision } from '../vault-events';
import { getDayActivity, recomputeActivityForVisits } from './activity';
import { aggregateVisits } from './aggregate';
import { getVaultEpoch, VAULT_EPOCH_KEY } from './epoch';
import { refreshRedirectMarkers } from './redirects';
import { findSupersededVisitIds } from './same-document';
import type {
  CalendarDayActivity,
  DayEntries,
  EntryGroup,
  PageRecord,
  RangeStats,
  VisitRecord,
} from './types';

const ENTRY_PAGE_DAYS = 7;

export interface EntryDaysPage {
  days: DayEntries[];
  hasMore: boolean;
}

async function getVisitsBetween(start: number, end: number): Promise<VisitRecord[]> {
  return db.visits.where('visitedAt').between(start, end, true, false).toArray();
}

export async function getRangeStats(
  start: number,
  end: number,
  granularity: 'day' | 'hour' = 'day',
): Promise<RangeStats> {
  const visits = await getVisitsBetween(start, end);
  return aggregateVisits(visits, start, end, granularity);
}

/**
 * Loads history one small page of days at a time. The day summary table keeps
 * this cheap even when the vault contains years of history: an empty calendar
 * month does not require scanning any visits.
 */
export async function getEntryDaysPage(
  start: number,
  end: number,
  options: { limit?: number; before?: string } = {},
): Promise<EntryDaysPage> {
  const limit = options.limit ?? ENTRY_PAGE_DAYS;
  const rows = await db.activity
    .where('date')
    .between(dayKey(start), options.before ?? dayKey(end - 1), true, options.before === undefined)
    .reverse()
    .limit(limit + 1)
    .toArray();

  const page = rows.slice(0, limit);
  if (page.length === 0) return { days: [], hasMore: false };

  const visitsPerDay = await Promise.all(
    page.map((row) => {
      const dayStart = parseDayKey(row.date) ?? startOfDay(start);
      return getVisitsBetween(dayStart.getTime(), addDays(dayStart, 1).getTime());
    }),
  );
  const pages = await db.pages.bulkGet([...new Set(visitsPerDay.flat().map((visit) => visit.url))]);
  const pageMap = new Map<string, PageRecord>();

  for (const page of pages) {
    if (page) pageMap.set(page.url, page);
  }

  const days = page
    .map((row, index) => buildDayEntries(row.date, visitsPerDay[index] ?? [], pageMap))
    .filter((day): day is DayEntries => day !== null);

  return { days, hasMore: rows.length > limit };
}

export async function getRecentPages(limit = 8): Promise<PageRecord[]> {
  return db.pages.orderBy('lastVisitTime').reverse().limit(limit).toArray();
}

export async function getVaultDateBounds(): Promise<{ earliest: number; latest: number } | null> {
  const [first, last] = await Promise.all([
    db.visits.orderBy('visitedAt').first(),
    db.visits.orderBy('visitedAt').last(),
  ]);

  if (!first || !last) return null;
  return { earliest: first.visitedAt, latest: last.visitedAt };
}

export async function getCalendarActivity(
  start: number,
  end: number,
): Promise<Map<string, CalendarDayActivity>> {
  const days = await getDayActivity(start, end);
  return new Map(
    [...days.entries()].map(([date, day]) => [date, { views: day.views, pages: day.pages }]),
  );
}

export async function getVaultCounts(): Promise<{ pages: number; visits: number }> {
  const [pages, visits] = await Promise.all([db.pages.count(), db.visits.count()]);
  return { pages, visits };
}

export async function deleteUrlFromVault(url: string, date?: Date | number): Promise<void> {
  const visits =
    date === undefined
      ? await db.visits.where('url').equals(url).toArray()
      : await db.visits
          .where('[url+visitedAt]')
          .between([url, getDayRange(date).start], [url, getDayRange(date).end], true, false)
          .toArray();

  if (visits.length > 0) {
    await db.visits.bulkDelete(visits.map((visit) => visit.id));
    await recomputeActivityForVisits(visits);
  }

  await cleanupPage(url);
  await bumpVaultRevision();
}

/** Removes only the visits inside the given window, used for redirect cleanup. */
export async function deleteUrlVisitsBetween(
  url: string,
  start: number,
  end: number,
): Promise<void> {
  const visits = await db.visits
    .where('[url+visitedAt]')
    .between([url, start], [url, end], true, true)
    .toArray();
  if (visits.length === 0) return;

  await db.visits.bulkDelete(visits.map((visit) => visit.id));
  await recomputeActivityForVisits(visits);
  await cleanupPage(url);
  await bumpVaultRevision();
}

/**
 * Import can run in a different page than the background worker that marks
 * redirects. Re-check a processed range against the latest markers so an
 * intermediate page cannot slip in while the batch was in flight.
 */
export async function removeRedirectedVisits(start: number, end: number): Promise<void> {
  const markers = await refreshRedirectMarkers();

  for (const marker of markers) {
    if (marker.to < start || marker.from >= end) continue;
    await deleteUrlVisitsBetween(
      marker.url,
      Math.max(marker.from, start),
      Math.min(marker.to, end),
    );
  }
}

/**
 * Removes URL variants left by same-document navigations that were imported
 * or recorded before the live collapse existed. Untitled/URL-titled visits are
 * dropped when a titled visit follows, and titled visits are dropped when the
 * later URL only changes tracking parameters. Meaningful query changes and
 * ordinary navigation are kept.
 */
export async function removeSupersededSameDocumentVisits(
  start: number,
  end: number,
): Promise<number> {
  const visits = await getVisitsBetween(start, end);
  if (visits.length < 2) return 0;

  const pages = await db.pages.bulkGet([...new Set(visits.map((visit) => visit.url))]);
  const titleMap = new Map<string, string>();
  for (const page of pages) {
    if (page) titleMap.set(page.url, page.title);
  }

  const ids = findSupersededVisitIds(
    visits.map((visit) => ({
      id: visit.id,
      url: visit.url,
      visitedAt: visit.visitedAt,
      transition: visit.transition,
      referringVisitId: visit.referringVisitId,
      title: titleMap.get(visit.url),
    })),
  );
  if (ids.length === 0) return 0;

  const idSet = new Set(ids);
  const removed = visits.filter((visit) => idSet.has(visit.id));
  await db.visits.bulkDelete(ids);
  await recomputeActivityForVisits(removed);

  for (const url of new Set(removed.map((visit) => visit.url))) {
    await cleanupPage(url);
  }

  await bumpVaultRevision();
  return ids.length;
}

export async function deleteDayFromVault(date: Date | number): Promise<void> {
  const range = getDayRange(date);
  const visits = await getVisitsBetween(range.start, range.end);
  if (visits.length === 0) return;

  const urls = [...new Set(visits.map((visit) => visit.url))];
  await db.visits.bulkDelete(visits.map((visit) => visit.id));
  await db.activity.delete(dayKey(range.start));

  for (const url of urls) {
    await cleanupPage(url);
  }

  await bumpVaultRevision();
}

export async function clearVaultData(): Promise<void> {
  await db.transaction('rw', db.pages, db.visits, db.activity, db.meta, async () => {
    const currentEpoch = await getVaultEpoch();
    await db.pages.clear();
    await db.visits.clear();
    await db.activity.clear();
    await db.meta.clear();
    await db.meta.put({ key: VAULT_EPOCH_KEY, value: currentEpoch + 1 });
  });
  await bumpVaultRevision();
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;

  try {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}

function buildDayEntries(
  date: string,
  visits: VisitRecord[],
  pageMap: Map<string, PageRecord>,
): DayEntries | null {
  if (visits.length === 0) return null;

  const entries = new Map<string, EntryGroup>();
  let start = Number.POSITIVE_INFINITY;

  for (const visit of visits) {
    start = Math.min(start, startOfDay(visit.visitedAt).getTime());
    const page = pageMap.get(visit.url);
    const existing = entries.get(visit.url);

    if (existing) {
      existing.count += 1;
      if (visit.visitedAt > existing.latestVisit) {
        existing.latestVisit = visit.visitedAt;
        existing.transition = visit.transition;
      }
    } else {
      entries.set(visit.url, {
        url: visit.url,
        title: page?.title || visit.url,
        host: page?.host || visit.host,
        latestVisit: visit.visitedAt,
        count: 1,
        transition: visit.transition,
      });
    }
  }

  return {
    date,
    start: Number.isFinite(start) ? start : 0,
    entries: [...entries.values()].sort((left, right) => right.latestVisit - left.latestVisit),
  };
}

async function cleanupPage(url: string): Promise<void> {
  const remaining = await db.visits.where('url').equals(url).toArray();
  if (remaining.length === 0) {
    await db.pages.delete(url);
    return;
  }

  let first = Number.POSITIVE_INFINITY;
  let last = 0;
  for (const visit of remaining) {
    first = Math.min(first, visit.visitedAt);
    last = Math.max(last, visit.visitedAt);
  }

  await db.pages.update(url, {
    firstVisitTime: first,
    lastVisitTime: last,
    visitCount: remaining.length,
  });
}
