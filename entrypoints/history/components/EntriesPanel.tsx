import type { MouseEvent } from 'react';
import { formatCount, formatDateHeader, formatTime } from '@/utils/date';
import type { EntryGroup } from '@/utils/history/types';
import { getDisplayUrl } from '@/utils/url';
import { TrashIcon } from '../lib/icons';
import { Favicon } from './Favicon';
import { VirtualList } from './VirtualList';

interface EntriesPanelProps {
  date: Date;
  entries: EntryGroup[];
  loading: boolean;
  onOpen: (url: string) => void;
  onContextMenu: (entry: EntryGroup, event: MouseEvent) => void;
  onDeleteDay: (date: Date) => void;
}

export function EntriesPanel({
  date,
  entries,
  loading,
  onOpen,
  onContextMenu,
  onDeleteDay,
}: EntriesPanelProps) {
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <section aria-label="選択日の履歴" className="entries-panel">
      <header className="panel-header">
        <div className="panel-heading">
          <span className="panel-title">{formatDateHeader(date)}</span>
          {total > 0 ? <span className="count-badge">{formatCount(total)}</span> : null}
        </div>
        <button
          aria-label="この日の履歴をVaultから削除"
          className="icon-button icon-button-small"
          onClick={() => onDeleteDay(date)}
          title="この日の履歴をVaultから削除"
          type="button"
        >
          <TrashIcon size={15} />
        </button>
      </header>

      <VirtualList
        empty={<span>{loading ? '読み込み中…' : 'この日の履歴はありません。'}</span>}
        estimateSize={48}
        getKey={(entry) => entry.url}
        items={entries}
        renderItem={(entry) => (
          <EntryRow entry={entry} onContextMenu={onContextMenu} onOpen={onOpen} />
        )}
      />
    </section>
  );
}

interface EntryRowProps {
  entry: EntryGroup;
  onOpen: (url: string) => void;
  onContextMenu: (entry: EntryGroup, event: MouseEvent) => void;
}

export function EntryRow({ entry, onOpen, onContextMenu }: EntryRowProps) {
  return (
    <button
      aria-label={`${entry.title}、${formatTime(entry.latestVisit)}、${entry.count}回`}
      className="entry-row"
      onClick={() => onOpen(entry.url)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(entry, event);
      }}
      type="button"
    >
      <span className="entry-time">{formatTime(entry.latestVisit)}</span>
      <Favicon host={entry.host} size={16} url={entry.url} />
      <span className="entry-main">
        <span className="entry-title">{entry.title}</span>
        <span className="entry-url">{getDisplayUrl(entry.url)}</span>
      </span>
      {entry.count > 1 ? <span className="entry-count">{formatCount(entry.count)}</span> : null}
    </button>
  );
}
