import { addCalendarDays, dayKey, formatHour, formatShortDate, startOfDay } from '../date';
import { categorizeTransition, emptyTransitionCounts } from './transitions';
import type {
  ActivityPoint,
  DayStats,
  DomainCount,
  RangeStats,
  TransitionCounts,
  VisitRecord,
} from './types';

interface MutableDay {
  start: number;
  views: number;
  pages: Set<string>;
  domains: Map<string, number>;
  transitions: TransitionCounts;
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
  const allPages = new Set<string>();
  const allDomains = new Map<string, number>();
  const allTransitions = emptyTransitionCounts();

  for (const visit of visits) {
    if (visit.visitedAt < start || visit.visitedAt >= end) continue;

    const key = dayKey(visit.visitedAt);
    let day = dayMap.get(key);
    if (!day) {
      day = {
        start: startOfDay(visit.visitedAt).getTime(),
        views: 0,
        pages: new Set<string>(),
        domains: new Map<string, number>(),
        transitions: emptyTransitionCounts(),
        hourly: Array.from({ length: 24 }, () => 0),
        hourlyPages: Array.from({ length: 24 }, () => new Set<string>()),
      };
      dayMap.set(key, day);
    }

    const category = categorizeTransition(visit.transition);
    const hour = new Date(visit.visitedAt).getHours();

    day.views += 1;
    day.pages.add(visit.url);
    day.domains.set(visit.host, (day.domains.get(visit.host) ?? 0) + 1);
    day.transitions[category] += 1;
    day.hourly[hour] = (day.hourly[hour] ?? 0) + 1;
    day.hourlyPages[hour]?.add(visit.url);

    allPages.add(visit.url);
    allDomains.set(visit.host, (allDomains.get(visit.host) ?? 0) + 1);
    allTransitions[category] += 1;
  }

  const days = [...dayMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, day]) => toDayStats(date, day));

  const series =
    granularity === 'hour'
      ? buildHourlySeries(dayMap.get(dayKey(start)), start)
      : buildDailySeries(dayMap, start, end);

  const maxViews = series.reduce((max, point) => Math.max(max, point.views), 0);

  return {
    start,
    end,
    views: days.reduce((total, day) => total + day.views, 0),
    pages: allPages.size,
    days,
    series,
    transitions: allTransitions,
    topDomains: toTopDomains(allDomains, 5),
    domainCount: allDomains.size,
    maxViews,
  };
}

function toDayStats(date: string, day: MutableDay): DayStats {
  return {
    date,
    start: day.start,
    views: day.views,
    pages: day.pages.size,
    topDomains: toTopDomains(day.domains, 3),
    transitions: day.transitions,
    hourly: day.hourly,
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
