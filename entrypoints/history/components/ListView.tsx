import { type MouseEvent, useMemo } from 'react';
import { formatCount, formatRelativeDateHeader } from '@/utils/date';
import type { DayEntries, EntryGroup } from '@/utils/history/types';
import { EntryRow } from './EntriesPanel';
import { VirtualList } from './VirtualList';

type ListRow =
  | { type: 'header'; date: string; start: number; total: number }
  | { type: 'entry'; entry: EntryGroup };

interface ListViewProps {
  days: DayEntries[];
  loading: boolean;
  onOpen: (url: string) => void;
  onContextMenu: (entry: EntryGroup, event: MouseEvent) => void;
}

export function ListView({ days, loading, onOpen, onContextMenu }: ListViewProps) {
  const rows = useMemo(() => flattenDays(days), [days]);

  return (
    <section aria-label="履歴リスト" className="list-view">
      <VirtualList
        empty={<span>{loading ? '読み込み中…' : '履歴がありません。'}</span>}
        estimateSize={(index) => (rows[index]?.type === 'header' ? 38 : 50)}
        getKey={(row) =>
          row.type === 'header' ? `header-${row.date}` : `${row.entry.url}-${row.entry.latestVisit}`
        }
        items={rows}
        renderItem={(row) =>
          row.type === 'header' ? (
            <div className="list-date-header">
              <span>{formatRelativeDateHeader(row.start)}</span>
              <span className="count-badge">{formatCount(row.total)}</span>
            </div>
          ) : (
            <EntryRow entry={row.entry} onContextMenu={onContextMenu} onOpen={onOpen} />
          )
        }
      />
    </section>
  );
}

function flattenDays(days: DayEntries[]): ListRow[] {
  const rows: ListRow[] = [];

  for (const day of days) {
    const total = day.entries.reduce((sum, entry) => sum + entry.count, 0);
    rows.push({ type: 'header', date: day.date, start: day.start, total });
    for (const entry of day.entries) {
      rows.push({ type: 'entry', entry });
    }
  }

  return rows;
}
