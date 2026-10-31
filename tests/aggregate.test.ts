import { describe, expect, it } from 'vitest';
import { aggregateVisits } from '../utils/history/aggregate';
import type { VisitRecord } from '../utils/history/types';

function visit(
  id: string,
  url: string,
  host: string,
  visitedAt: number,
  transition = 'link',
): VisitRecord {
  return { id, url, host, visitedAt, transition, source: 'live' };
}

describe('aggregateVisits', () => {
  it('aggregates views, pages, domains, transitions, and series', () => {
    const start = new Date(2025, 8, 24).getTime();
    const end = new Date(2025, 8, 26).getTime();
    const visits = [
      visit('1', 'https://example.com/a', 'example.com', start + 3_600_000, 'typed'),
      visit('2', 'https://example.com/a', 'example.com', start + 7_200_000, 'link'),
      visit('3', 'https://other.test/b', 'other.test', start + 86_400_000, 'reload'),
    ];

    const stats = aggregateVisits(visits, start, end, 'day');

    expect(stats.views).toBe(3);
    expect(stats.transitions.typed).toBe(1);
    expect(stats.transitions.link).toBe(1);
    expect(stats.transitions.reload).toBe(1);
    expect(stats.series).toHaveLength(2);
    expect(stats.series[0]?.views).toBe(2);
    expect(stats.series[0]?.pages).toBe(1);
    expect(stats.maxViews).toBe(2);
  });

  it('builds an hourly series for a single day', () => {
    const start = new Date(2025, 8, 25).getTime();
    const end = start + 86_400_000;
    const visits = [
      visit('1', 'https://example.com/a', 'example.com', start + 9 * 3_600_000),
      visit('2', 'https://example.com/b', 'example.com', start + 9 * 3_600_000 + 60_000),
    ];

    const stats = aggregateVisits(visits, start, end, 'hour');

    expect(stats.series).toHaveLength(24);
    expect(stats.series[9]?.views).toBe(2);
    expect(stats.series[9]?.pages).toBe(2);
    expect(stats.views).toBe(2);
  });
});
