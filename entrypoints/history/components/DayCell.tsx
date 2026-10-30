import { formatCount, formatDateHeader } from '@/utils/date';
import type { DayStats } from '@/utils/history/types';
import { getHeatColor } from '../lib/heat';

interface DayCellProps {
  date: Date;
  stats: DayStats | undefined;
  selected: boolean;
  currentMonth: boolean;
  maxViews: number;
  theme: 'light' | 'dark';
  onSelect: (date: Date) => void;
}

export function DayCell({
  date,
  stats,
  selected,
  currentMonth,
  maxViews,
  theme,
  onSelect,
}: DayCellProps) {
  const views = stats?.views ?? 0;
  const pages = stats?.pages ?? 0;
  const classes = [
    'day-cell-wrap',
    currentMonth ? '' : 'is-outside',
    selected ? 'is-selected' : '',
    date.toDateString() === new Date().toDateString() ? 'is-today' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <button
        aria-label={`${formatDateHeader(date)}${views > 0 ? `、${views}閲覧、${pages}ページ` : ''}`}
        aria-pressed={selected}
        className="day-cell"
        onClick={() => onSelect(date)}
        style={{ backgroundColor: getHeatColor(views, maxViews, theme) }}
        type="button"
      >
        <span className="day-number">{date.getDate()}</span>
        {stats && stats.views > 0 ? (
          <>
            <span className="day-counts">
              <strong>{formatCount(stats.views)} 閲覧</strong>
              <span>{formatCount(stats.pages)} ページ</span>
            </span>
            <span className="day-domains">
              {stats.topDomains.map((domain) => (
                <span className="day-domain" key={domain.host} title={domain.host}>
                  {domain.host}
                </span>
              ))}
            </span>
          </>
        ) : null}
      </button>
    </div>
  );
}
