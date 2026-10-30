import { dayKey, getDayRange, startOfDay } from '../date';
import { db } from '../db';
import { bumpVaultRevision } from '../vault-events';
import { aggregateVisits } from './aggregate';
import { getVaultEpoch, VAULT_EPOCH_KEY } from './epoch';
import type { DayEntries, EntryGroup, PageRecord, RangeStats, VisitRecord } from './types';

export async function getVisitsBetween(start: number, end: number): Promise<VisitRecord[]> {
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

export async function getDayEntries(input: Date | number): Promise<DayEntries> {
  const range = getDayRange(input);
  const days = await getEntriesInRange(range.start, range.end);
  return days[0] ?? { date: dayKey(input), start: range.start, entries: [] };
}

export async function getEntriesInRange(start: number, end: number): Promise<DayEntries[]> {
  const visits = await getVisitsBetween(start, end);
  if (visits.length === 0) return [];

  const pages = await db.pages.bulkGet([...new Set(visits.map((visit) => visit.url))]);
  const pageMap = new Map<string, PageRecord>();
  for (const page of pages) {
    if (page) pageMap.set(page.url, page);
  }

  const dayMap = new Map<string, { start: number; entries: Map<string, EntryGroup> }>();

  for (const visit of visits) {
    const key = dayKey(visit.visitedAt);
    let day = dayMap.get(key);
    if (!day) {
      day = {
        start: startOfDay(visit.visitedAt).getTime(),
        entries: new Map<string, EntryGroup>(),
      };
      dayMap.set(key, day);
    }

    const page = pageMap.get(visit.url);
    const existing = day.entries.get(visit.url);

    if (existing) {
      existing.count += 1;
      if (visit.visitedAt > existing.latestVisit) {
        existing.latestVisit = visit.visitedAt;
        existing.transition = visit.transition;
      }
    } else {
      day.entries.set(visit.url, {
        url: visit.url,
        title: page?.title || visit.url,
        host: page?.host || visit.host,
        latestVisit: visit.visitedAt,
        count: 1,
        transition: visit.transition,
      });
    }
  }

  return [...dayMap.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, day]) => ({
      date,
      start: day.start,
      entries: [...day.entries.values()].sort(
        (left, right) => right.latestVisit - left.latestVisit,
      ),
    }));
}

export async function getRecentPages(limit = 8): Promise<PageRecord[]> {
  return db.pages.orderBy('lastVisitTime').reverse().limit(limit).toArray();
}

export async function getVaultCounts(): Promise<{ pages: number; visits: number }> {
  const [pages, visits] = await Promise.all([db.pages.count(), db.visits.count()]);
  return { pages, visits };
}

export async function deleteUrlFromVault(url: string, date?: Date | number): Promise<void> {
  if (date === undefined) {
    const ids = await db.visits.where('url').equals(url).primaryKeys();
    if (ids.length > 0) await db.visits.bulkDelete(ids);
  } else {
    const range = getDayRange(date);
    const ids = await db.visits
      .where('[url+visitedAt]')
      .between([url, range.start], [url, range.end], true, false)
      .primaryKeys();
    if (ids.length > 0) await db.visits.bulkDelete(ids);
  }

  await cleanupPage(url);
  await bumpVaultRevision();
}

export async function deleteDayFromVault(date: Date | number): Promise<void> {
  const range = getDayRange(date);
  const visits = await getVisitsBetween(range.start, range.end);
  if (visits.length === 0) return;

  const urls = [...new Set(visits.map((visit) => visit.url))];
  await db.visits.bulkDelete(visits.map((visit) => visit.id));

  for (const url of urls) {
    await cleanupPage(url);
  }

  await bumpVaultRevision();
}

export async function clearVaultData(): Promise<void> {
  await db.transaction('rw', db.pages, db.visits, db.meta, async () => {
    const currentEpoch = await getVaultEpoch();
    await db.pages.clear();
    await db.visits.clear();
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

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const record = await db.meta.get(key);
  return record?.value as T | undefined;
}

async function cleanupPage(url: string): Promise<void> {
  const remaining = await db.visits.where('url').equals(url).toArray();
  if (remaining.length === 0) {
    await db.pages.delete(url);
    return;
  }

  const latest = remaining.reduce((max, visit) => Math.max(max, visit.visitedAt), 0);
  await db.pages.update(url, { lastVisitTime: latest });
}
