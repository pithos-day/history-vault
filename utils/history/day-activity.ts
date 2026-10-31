import { dayKey } from '../date';
import type { DayActivityRecord, VisitRecord } from './types';

export interface DayActivityAccumulator {
  views: number;
  urls: Set<string>;
}

/**
 * Rolls visits up into one row per day. The calendar only needs counts, so
 * keeping this summary avoids reading every visit when the page opens.
 */
export function addVisitToDayActivity(
  days: Map<string, DayActivityAccumulator>,
  visit: Pick<VisitRecord, 'url' | 'visitedAt'>,
): void {
  const date = dayKey(visit.visitedAt);
  let day = days.get(date);

  if (!day) {
    day = { views: 0, urls: new Set<string>() };
    days.set(date, day);
  }

  day.views += 1;
  day.urls.add(visit.url);
}

export function toDayActivityRecords(
  days: Map<string, DayActivityAccumulator>,
): DayActivityRecord[] {
  return [...days.entries()]
    .map(([date, day]) => ({ date, views: day.views, pages: day.urls.size }))
    .sort((left, right) => left.date.localeCompare(right.date));
}
