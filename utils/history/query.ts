import { addCalendarDays, dayKey, getDayRange, parseDayKey, startOfDay } from '../date';
import { db } from '../db';
import { bumpVaultRevision } from '../vault-events';
import { getDayActivity, recomputeActivityForVisits } from './activity';
import { aggregateVisits } from './aggregate';
import { getVaultEpoch, VAULT_EPOCH_KEY } from './epoch';
import { findSupersededRedirectVisitIds, refreshRedirectMarkers } from './redirects';
import { findSupersededVisitIds } from './same-document';
import type {
  CalendarDayActivity,
  DayActivityRecord,
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

  return {
    days: await buildDayEntriesForRows(page, start),
    hasMore: rows.length > limit,
  };
}

async function buildDayEntriesForRows(
  rows: DayActivityRecord[],
  fallbackStart: number,
): Promise<DayEntries[]> {
  if (rows.length === 0) return [];

  let rangeStart = Number.POSITIVE_INFINITY;
  let rangeEnd = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const dayStart = parseDayKey(row.date)?.getTime() ?? startOfDay(fallbackStart).getTime();
    rangeStart = Math.min(rangeStart, dayStart);
    rangeEnd = Math.max(rangeEnd, addCalendarDays(dayStart, 1).getTime());
  }

  const visits = await getVisitsBetween(rangeStart, rangeEnd);
  const visitsByDate = new Map<string, VisitRecord[]>();

  for (const visit of visits) {
    const date = dayKey(visit.visitedAt);
    const group = visitsByDate.get(date);
    if (group) group.push(visit);
    else visitsByDate.set(date, [visit]);
  }

  const pages = await db.pages.bulkGet([...new Set(visits.map((visit) => visit.url))]);
  const pageMap = new Map<string, PageRecord>();

  for (const page of pages) {
    if (page) pageMap.set(page.url, page);
  }

  return rows
    .map((row) => buildDayEntries(row.date, visitsByDate.get(row.date) ?? [], pageMap))
    .filter((day): day is DayEntries => day !== null)
    .sort((left, right) => right.date.localeCompare(left.date));
}

/**
 * Rebuilds only the requested days after a revision tells the list which
 * days changed. This keeps live visits from re-reading every loaded day.
 */
export async function getDayEntriesForDates(dates: readonly string[]): Promise<DayEntries[]> {
  if (dates.length === 0) return [];

  const rows = (await db.activity.bulkGet([...new Set(dates)])).filter(
    (row): row is DayActivityRecord => row !== undefined,
  );
  if (rows.length === 0) return [];

  return buildDayEntriesForRows(rows, Date.now());
}

export async function getRecentPages(limit = 8): Promise<PageRecord[]> {
  return db.pages.orderBy('lastVisitTime').reverse().limit(limit).toArray();
}

export interface VaultOverview {
  bounds: { earliest: number; latest: number } | null;
  activity: Map<string, CalendarDayActivity>;
}

/**
 * The calendar only needs one row per day. Reading the activity table once
 * gives both the date bounds and every heat-map cell, so opening the page does
 * not need separate first/last visit scans.
 */
export async function getVaultOverview(): Promise<VaultOverview> {
  const rows = await db.activity.orderBy('date').toArray();
  if (rows.length === 0) {
    return { bounds: await getVaultDateBounds(), activity: new Map() };
  }

  const first = parseDayKey(rows[0]?.date ?? '');
  const last = parseDayKey(rows[rows.length - 1]?.date ?? '');
  return {
    bounds: first && last ? { earliest: first.getTime(), latest: last.getTime() } : null,
    activity: new Map(rows.map((day) => [day.date, { views: day.views, pages: day.pages }])),
  };
}

async function getVaultDateBounds(): Promise<{ earliest: number; latest: number } | null> {
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

/** Reads only the days named by a revision so the calendar can patch itself. */
export async function getCalendarActivityForDates(
  dates: readonly string[],
): Promise<Map<string, CalendarDayActivity>> {
  if (dates.length === 0) return new Map();

  const rows = (await db.activity.bulkGet([...new Set(dates)])).filter(
    (row): row is DayActivityRecord => row !== undefined,
  );
  return new Map(rows.map((day) => [day.date, { views: day.views, pages: day.pages }]));
}

export async function getVaultCounts(): Promise<{ pages: number; visits: number }> {
  const [pages, days] = await Promise.all([db.pages.count(), db.activity.toArray()]);
  if (days.length === 0) {
    return { pages, visits: await db.visits.count() };
  }

  return {
    pages,
    visits: days.reduce((total, day) => total + day.views, 0),
  };
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
  await bumpVaultRevision({ days: visits.map((visit) => dayKey(visit.visitedAt)) });
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
  await bumpVaultRevision({ days: visits.map((visit) => dayKey(visit.visitedAt)) });
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
 * Removes redirect hops that were imported before a live navigation marker
 * existed. Chromium stores every hop with the same timestamp and links each
 * hop to the previous visit, so the final hop can be kept without relying on
 * webNavigation events.
 */
export async function removeInferredRedirectVisits(start: number, end: number): Promise<number> {
  const visits = await getVisitsBetween(start, end);
  if (visits.length < 2) return 0;

  return deleteSupersededVisits(visits, findSupersededRedirectVisitIds(visits));
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

  const titleMap = await loadPageTitles(visits);
  return deleteSupersededVisits(visits, findSameDocumentVisitIds(visits, titleMap));
}

/**
 * Applies both cleanup rules in one pass. Reading the range and its page
 * titles once avoids the duplicate scans that used to run when the history
 * page opened.
 */
export async function cleanupHistoryRange(start: number, end: number): Promise<void> {
  const visits = await getVisitsBetween(start, end);
  if (visits.length < 2) return;

  const titleMap = await loadPageTitles(visits);
  const ids = new Set([
    ...findSupersededRedirectVisitIds(visits),
    ...findSameDocumentVisitIds(visits, titleMap),
  ]);
  if (ids.size === 0) return;

  await deleteSupersededVisits(visits, [...ids]);
}

async function loadPageTitles(visits: readonly VisitRecord[]): Promise<Map<string, string>> {
  const pages = await db.pages.bulkGet([...new Set(visits.map((visit) => visit.url))]);
  const titles = new Map<string, string>();

  for (const page of pages) {
    if (page) titles.set(page.url, page.title);
  }

  return titles;
}

function findSameDocumentVisitIds(
  visits: readonly VisitRecord[],
  titleMap: ReadonlyMap<string, string>,
): string[] {
  return findSupersededVisitIds(
    visits.map((visit) => ({
      id: visit.id,
      url: visit.url,
      visitedAt: visit.visitedAt,
      transition: visit.transition,
      referringVisitId: visit.referringVisitId,
      title: titleMap.get(visit.url),
    })),
  );
}

async function deleteSupersededVisits(
  visits: readonly VisitRecord[],
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0;

  const idSet = new Set(ids);
  const removed = visits.filter((visit) => idSet.has(visit.id));
  if (removed.length === 0) return 0;

  await db.visits.bulkDelete(removed.map((visit) => visit.id));
  await recomputeActivityForVisits(removed);

  for (const url of new Set(removed.map((visit) => visit.url))) {
    await cleanupPage(url);
  }

  await bumpVaultRevision({ days: removed.map((visit) => dayKey(visit.visitedAt)) });
  return removed.length;
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

  await bumpVaultRevision({ days: [dayKey(range.start)] });
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
  await bumpVaultRevision({ reset: true });
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
