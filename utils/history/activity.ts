import { addCalendarDays, dayKey, parseDayKey, startOfDay } from '../date';
import { db } from '../db';
import type { VisitRecord } from './types';

interface VisitDayGroup {
  date: string;
  start: number;
  url: string;
  count: number;
}

/**
 * Adds newly inserted visits to the per-day summary. Call this before the
 * visits are written so the "first visit of this URL on that day" check sees
 * only the pre-existing rows.
 */
export async function addVisitsToActivity(visits: VisitRecord[]): Promise<void> {
  const groups = new Map<string, VisitDayGroup>();

  for (const visit of visits) {
    const start = startOfDay(visit.visitedAt).getTime();
    const date = dayKey(start);
    const key = `${date}\u0000${visit.url}`;
    const group = groups.get(key);

    if (group) group.count += 1;
    else groups.set(key, { date, start, url: visit.url, count: 1 });
  }

  for (const group of groups.values()) {
    const end = addCalendarDays(group.start, 1).getTime();
    const previousVisits = await db.visits
      .where('[url+visitedAt]')
      .between([group.url, group.start], [group.url, end], true, false)
      .count();
    const current = await db.activity.get(group.date);

    if (!current) {
      const dayVisits = await db.visits
        .where('visitedAt')
        .between(group.start, end, true, false)
        .toArray();
      const pages = new Set(dayVisits.map((visit) => visit.url));
      pages.add(group.url);
      await db.activity.put({
        date: group.date,
        views: dayVisits.length + group.count,
        pages: pages.size,
      });
      continue;
    }

    await db.activity.put({
      date: group.date,
      views: current.views + group.count,
      pages: current.pages + (previousVisits > 0 ? 0 : 1),
    });
  }
}

async function recomputeDayActivity(date: string): Promise<void> {
  const dayStart = parseDayKey(date);
  if (!dayStart) return;

  const start = dayStart.getTime();
  const end = addCalendarDays(dayStart, 1).getTime();
  const visits = await db.visits.where('visitedAt').between(start, end, true, false).toArray();

  if (visits.length === 0) {
    await db.activity.delete(date);
    return;
  }

  await db.activity.put({
    date,
    views: visits.length,
    pages: new Set(visits.map((visit) => visit.url)).size,
  });
}

export async function recomputeActivityForVisits(visits: VisitRecord[]): Promise<void> {
  const dates = new Set(visits.map((visit) => dayKey(visit.visitedAt)));
  for (const date of dates) {
    await recomputeDayActivity(date);
  }
}

/** Rebuilds only the days touched by an import instead of scanning the vault. */
export async function recomputeActivityForDates(dates: Iterable<string>): Promise<void> {
  for (const date of new Set(dates)) {
    await recomputeDayActivity(date);
  }
}
