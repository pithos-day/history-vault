import type { MouseEvent } from 'react';
import { formatCount, formatDateHeader, formatHour } from '@/utils/date';
import type { EntryGroup, RangeStats } from '@/utils/history/types';
import { getHostUrl } from '@/utils/url';
import { EntriesPanel } from './EntriesPanel';
import { Favicon } from './Favicon';

interface DayViewProps {
  date: Date;
  stats: RangeStats | null;
  entries: EntryGroup[];
  loading: boolean;
  onOpen: (url: string) => void;
  onContextMenu: (entry: EntryGroup, event: MouseEvent) => void;
  onDeleteDay: (date: Date) => void;
}

export function DayView({
  date,
  stats,
  entries,
  loading,
  onOpen,
  onContextMenu,
  onDeleteDay,
}: DayViewProps) {
  const hourly = stats?.series ?? [];
  const maxViews = stats?.maxViews ?? 0;

  return (
    <section aria-label="日別履歴" className="day-view">
      <div className="day-summary">
        <div className="day-summary-heading">
          <h1>{formatDateHeader(date)}</h1>
          {stats ? (
            <span>
              {formatCount(stats.views)} 閲覧 / {formatCount(stats.pages)} ページ
            </span>
          ) : null}
        </div>

        <div aria-label="時間帯別の閲覧数" className="hourly-strip" role="img">
          {hourly.map((point, index) => {
            const ratio = maxViews > 0 ? point.views / maxViews : 0;
            return (
              <div
                className="hourly-column"
                key={point.start}
                title={`${formatHour(index)}: ${point.views}閲覧`}
              >
                <span className="hourly-bar" style={{ height: `${Math.max(4, ratio * 100)}%` }} />
                {index % 4 === 0 ? <span className="hourly-label">{index}</span> : null}
              </div>
            );
          })}
        </div>

        {stats && stats.topDomains.length > 0 ? (
          <div className="day-domains">
            {stats.topDomains.map((domain) => (
              <span className="domain-chip" key={domain.host}>
                <Favicon host={domain.host} size={14} url={getHostUrl(domain.host)} />
                {domain.host}
                <strong>{formatCount(domain.count)}</strong>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="day-entries">
        <EntriesPanel
          date={date}
          entries={entries}
          loading={loading}
          onContextMenu={onContextMenu}
          onDeleteDay={onDeleteDay}
          onOpen={onOpen}
        />
      </div>
    </section>
  );
}
