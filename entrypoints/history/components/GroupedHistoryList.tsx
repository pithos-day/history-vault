import { type MouseEvent, useCallback, useMemo, useState } from 'react';
import { formatCount, formatDateGroupHeader } from '@/utils/date';
import type { DayEntries, EntryGroup } from '@/utils/history/types';
import { ChevronDownIcon, TrashIcon } from '../lib/icons';
import { buildListRows, type HistoryListRow } from '../lib/listRows';
import { EntryRow } from './EntryRow';
import { VirtualList } from './VirtualList';

interface GroupedHistoryListProps {
  days: DayEntries[];
  loading: boolean;
  emptyText: string;
  ariaLabel: string;
  onOpen: (url: string) => void;
  onContextMenu: (entry: EntryGroup, event: MouseEvent) => void;
  onDeleteDay?: (date: Date) => void;
}

export function GroupedHistoryList({
  days,
  loading,
  emptyText,
  ariaLabel,
  onOpen,
  onContextMenu,
  onDeleteDay,
}: GroupedHistoryListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const rows = useMemo(() => buildListRows(days, collapsed), [days, collapsed]);

  const toggleDay = useCallback((date: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  return (
    <section aria-label={ariaLabel} className="grouped-list">
      <div aria-hidden="true" className="list-columns">
        <span className="list-column-date">日付</span>
        <span className="list-column-title">タイトル</span>
        <span className="list-column-url">アドレス</span>
        <span className="list-column-count">閲覧回数</span>
      </div>
      <VirtualList
        empty={<span>{loading ? '読み込み中…' : emptyText}</span>}
        estimateSize={(index) => (rows[index]?.type === 'header' ? 24 : 26)}
        getKey={(row) =>
          row.type === 'header' ? `header-${row.date}` : `${row.entry.url}-${row.entry.latestVisit}`
        }
        items={rows}
        key={days[0]?.date ?? 'empty'}
        renderItem={(row) =>
          row.type === 'header' ? (
            <DateGroupHeader onDeleteDay={onDeleteDay} onToggle={toggleDay} row={row} />
          ) : (
            <EntryRow entry={row.entry} onContextMenu={onContextMenu} onOpen={onOpen} />
          )
        }
      />
    </section>
  );
}

interface DateGroupHeaderProps {
  row: Extract<HistoryListRow, { type: 'header' }>;
  onToggle: (date: string) => void;
  onDeleteDay?: (date: Date) => void;
}

function DateGroupHeader({ row, onToggle, onDeleteDay }: DateGroupHeaderProps) {
  const date = new Date(row.start);

  return (
    <div className="list-date-header">
      <button
        aria-expanded={!row.collapsed}
        className="list-date-toggle"
        onClick={() => onToggle(row.date)}
        type="button"
      >
        <ChevronDownIcon
          className={`list-date-chevron ${row.collapsed ? 'is-collapsed' : ''}`}
          size={14}
        />
        <span className="list-date-label">{formatDateGroupHeader(row.start)}</span>
        <span className="count-badge">{formatCount(row.total)}</span>
      </button>
      {onDeleteDay ? (
        <button
          aria-label={`${formatDateHeader(date)}の履歴をVaultから削除`}
          className="icon-button icon-button-small list-date-delete"
          onClick={() => onDeleteDay(date)}
          title="この日の履歴をVaultから削除"
          type="button"
        >
          <TrashIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}
