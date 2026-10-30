import type { DayEntries, EntryGroup } from '@/utils/history/types';

export type HistoryListRow =
  | { type: 'header'; date: string; start: number; total: number; collapsed: boolean }
  | { type: 'entry'; entry: EntryGroup };

export function buildListRows(
  days: DayEntries[],
  collapsed: ReadonlySet<string>,
): HistoryListRow[] {
  const rows: HistoryListRow[] = [];

  for (const day of days) {
    const total = day.entries.reduce((sum, entry) => sum + entry.count, 0);
    const isCollapsed = collapsed.has(day.date);
    rows.push({
      type: 'header',
      date: day.date,
      start: day.start,
      total,
      collapsed: isCollapsed,
    });

    if (isCollapsed) continue;
    for (const entry of day.entries) {
      rows.push({ type: 'entry', entry });
    }
  }

  return rows;
}
