import type { MouseEvent } from 'react';
import { formatCount, formatTime } from '@/utils/date';
import type { EntryGroup } from '@/utils/history/types';
import { getDisplayUrl } from '@/utils/url';
import { Favicon } from './Favicon';

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
        <span className="entry-title">{entry.title || entry.url}</span>
        <span className="entry-url">{getDisplayUrl(entry.url)}</span>
      </span>
      {entry.count > 1 ? <span className="entry-count">{formatCount(entry.count)}</span> : null}
    </button>
  );
}
