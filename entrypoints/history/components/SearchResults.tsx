import { type MouseEvent, useMemo } from 'react';
import { dayKey, formatCount, formatRelativeDateHeader } from '@/utils/date';
import type { EntryGroup, SearchResult } from '@/utils/history/types';
import { EntryRow } from './EntriesPanel';
import { VirtualList } from './VirtualList';

type SearchRow =
  | { type: 'header'; date: string; start: number; total: number }
  | { type: 'entry'; entry: EntryGroup };

interface SearchResultsProps {
  query: string;
  results: SearchResult[];
  loading: boolean;
  onOpen: (url: string) => void;
  onContextMenu: (entry: EntryGroup, event: MouseEvent) => void;
}

export function SearchResults({
  query,
  results,
  loading,
  onOpen,
  onContextMenu,
}: SearchResultsProps) {
  const rows = useMemo(() => flattenResults(results), [results]);

  return (
    <section aria-label="検索結果" className="search-results">
      <header className="search-results-header">
        <div>
          <h1>「{query}」の検索結果</h1>
          <span>{loading ? '検索中…' : `${formatCount(results.length)}件`}</span>
        </div>
      </header>

      <VirtualList
        empty={<span>{loading ? '検索中…' : '一致する履歴がありません。'}</span>}
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

function flattenResults(results: SearchResult[]): SearchRow[] {
  const groups = new Map<string, { start: number; entries: EntryGroup[] }>();

  for (const result of results) {
    const key = dayKey(result.latestVisitTime);
    const group = groups.get(key) ?? { start: result.latestVisitTime, entries: [] };
    group.entries.push({
      url: result.page.url,
      title: result.page.title || result.page.url,
      host: result.page.host,
      latestVisit: result.latestVisitTime,
      count: result.count,
      transition: 'link',
    });
    groups.set(key, group);
  }

  const rows: SearchRow[] = [];
  for (const [date, group] of [...groups.entries()].sort(([left], [right]) =>
    right.localeCompare(left),
  )) {
    rows.push({
      type: 'header',
      date,
      start: group.start,
      total: group.entries.reduce((sum, entry) => sum + entry.count, 0),
    });
    for (const entry of group.entries.sort((left, right) => right.latestVisit - left.latestVisit)) {
      rows.push({ type: 'entry', entry });
    }
  }

  return rows;
}
