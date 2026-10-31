import { describe, expect, it } from 'vitest';
import { aggregateVisits } from '../utils/history/aggregate';
import { visitRecord } from './factories';

describe('aggregateVisits', () => {
  it('aggregates views, pages, domains, transitions, and series', () => {
    const start = new Date(2025, 8, 24).getTime();
    const end = new Date(2025, 8, 26).getTime();
    const visits = [
      visitRecord('1', 'https://example.com/a', start + 3_600_000, { transition: 'typed' }),
      visitRecord('2', 'https://example.com/a', start + 7_200_000),
      visitRecord('3', 'https://other.test/b', start + 86_400_000, { transition: 'reload' }),
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
      visitRecord('1', 'https://example.com/a', start + 9 * 3_600_000),
      visitRecord('2', 'https://example.com/b', start + 9 * 3_600_000 + 60_000),
    ];

    const stats = aggregateVisits(visits, start, end, 'hour');

    expect(stats.series).toHaveLength(24);
    expect(stats.series[9]?.views).toBe(2);
    expect(stats.series[9]?.pages).toBe(2);
    expect(stats.views).toBe(2);
  });
});
