import { addCalendarDays, dayKey, formatHour, formatShortDate, startOfDay } from '../date';
import { categorizeTransition, emptyTransitionCounts } from './transitions';
import type { ActivityPoint, DomainCount, RangeStats, VisitRecord } from './types';

interface MutableDay {
  views: number;
  pages: Set<string>;
  hourly: number[];
  hourlyPages: Array<Set<string>>;
}

export function aggregateVisits(
  visits: VisitRecord[],
  start: number,
  end: number,
  granularity: 'day' | 'hour',
): RangeStats {
  const dayMap = new Map<string, MutableDay>();
  const allDomains = new Map<string, number>();
  const allTransitions = emptyTransitionCounts();
  let allViews = 0;

  for (const visit of visits) {
    if (visit.visitedAt < start || visit.visitedAt >= end) continue;

    const key = dayKey(visit.visitedAt);
    let day = dayMap.get(key);
    if (!day) {
      day = {
        views: 0,
        pages: new Set<string>(),
        hourly: Array.from({ length: 24 }, () => 0),
        hourlyPages: Array.from({ length: 24 }, () => new Set<string>()),
      };
      dayMap.set(key, day);
    }

    const category = categorizeTransition(visit.transition);
    const hour = new Date(visit.visitedAt).getHours();

    day.views += 1;
    day.pages.add(visit.url);
    day.hourly[hour] = (day.hourly[hour] ?? 0) + 1;
    day.hourlyPages[hour]?.add(visit.url);

    allViews += 1;
    allDomains.set(visit.host, (allDomains.get(visit.host) ?? 0) + 1);
    allTransitions[category] += 1;
  }

  const series =
    granularity === 'hour'
      ? buildHourlySeries(dayMap.get(dayKey(start)), start)
      : buildDailySeries(dayMap, start, end);

  const maxViews = series.reduce((max, point) => Math.max(max, point.views), 0);

  return {
    start,
    end,
    views: allViews,
    series,
    transitions: allTransitions,
    topDomains: toTopDomains(allDomains, 5),
    domainCount: allDomains.size,
    maxViews,
  };
}

function buildDailySeries(
  dayMap: Map<string, MutableDay>,
  start: number,
  end: number,
): ActivityPoint[] {
  const first = startOfDay(start);
  const last = startOfDay(end - 1);
  const points: ActivityPoint[] = [];

  for (
    let cursor = first;
    cursor.getTime() <= last.getTime();
    cursor = addCalendarDays(cursor, 1)
  ) {
    const day = dayMap.get(dayKey(cursor));
    points.push({
      label: formatShortDate(cursor),
      start: cursor.getTime(),
      views: day?.views ?? 0,
      pages: day?.pages.size ?? 0,
    });
  }

  return points;
}

function buildHourlySeries(day: MutableDay | undefined, start: number): ActivityPoint[] {
  const dayStart = startOfDay(start).getTime();

  return Array.from({ length: 24 }, (_, hour) => ({
    label: formatHour(hour),
    start: dayStart + hour * 3_600_000,
    views: day?.hourly[hour] ?? 0,
    pages: day?.hourlyPages[hour]?.size ?? 0,
  }));
}

function toTopDomains(domains: Map<string, number>, limit: number): DomainCount[] {
  return [...domains.entries()]
    .map(([host, count]) => ({ host, count }))
    .sort((left, right) => right.count - left.count || left.host.localeCompare(right.host))
    .slice(0, limit);
}
