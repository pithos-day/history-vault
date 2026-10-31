import { type MouseEvent, useMemo } from 'react';
import { dayKey, formatCount, startOfDay } from '@/utils/date';
import type { DayEntries, EntryGroup, SearchResult } from '@/utils/history/types';
import { GroupedHistoryList } from './GroupedHistoryList';

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
  const days = useMemo(() => resultsToDays(results), [results]);

  return (
    <section aria-label="検索結果" className="search-results">
      <header className="search-results-header">
        <div>
          <h1>「{query}」の検索結果</h1>
          <span>{loading ? '検索中…' : `${formatCount(results.length)}件`}</span>
        </div>
      </header>

      <GroupedHistoryList
        ariaLabel="検索結果の履歴"
        days={days}
        emptyText={loading ? '検索中…' : '一致する履歴がありません。'}
        loading={loading}
        onContextMenu={onContextMenu}
        onOpen={onOpen}
      />
    </section>
  );
}

function resultsToDays(results: SearchResult[]): DayEntries[] {
  const groups = new Map<string, DayEntries>();

  for (const result of results) {
    const date = dayKey(result.latestVisitTime);
    const day = groups.get(date) ?? {
      date,
      start: startOfDay(result.latestVisitTime).getTime(),
      entries: [],
    };
    day.entries.push({
      url: result.page.url,
      title: result.page.title,
      host: result.page.host,
      latestVisit: result.latestVisitTime,
      count: result.count,
    });
    groups.set(date, day);
  }

  return [...groups.values()]
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((day) => ({
      ...day,
      entries: day.entries.sort((left, right) => right.latestVisit - left.latestVisit),
    }));
}
