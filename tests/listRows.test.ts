import { describe, expect, it } from 'vitest';
import { buildListRows } from '../entrypoints/history/lib/listRows';
import type { DayEntries, EntryGroup } from '../utils/history/types';

function entry(url: string, latestVisit: number): EntryGroup {
  return {
    url,
    title: url,
    host: new URL(url).host,
    latestVisit,
    count: 1,
  };
}

function day(date: string, start: number, entries: EntryGroup[]): DayEntries {
  return { date, start, entries };
}

const firstStart = new Date(2026, 9, 31).getTime();
const secondStart = new Date(2026, 9, 30).getTime();
const days = [
  day('2026-10-31', firstStart, [entry('https://example.com/a', firstStart)]),
  day('2026-10-30', secondStart, [
    entry('https://example.com/b', secondStart),
    entry('https://example.com/c', secondStart),
  ]),
];

describe('buildListRows', () => {
  it('keeps every date group expanded by default', () => {
    const rows = buildListRows(days, new Set());

    expect(rows.filter((row) => row.type === 'header')).toHaveLength(2);
    expect(rows.filter((row) => row.type === 'entry')).toHaveLength(3);
    expect(rows[0]).toMatchObject({ type: 'header', date: '2026-10-31', total: 1 });
  });

  it('hides entries for collapsed dates while keeping the header', () => {
    const rows = buildListRows(days, new Set(['2026-10-31']));

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      type: 'header',
      date: '2026-10-31',
      collapsed: true,
    });
    expect(rows[1]).toMatchObject({ type: 'header', date: '2026-10-30' });
    expect(rows.filter((row) => row.type === 'entry')).toHaveLength(2);
  });
});
