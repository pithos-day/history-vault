import { memo } from 'react';
import { dayKey, formatDateHeader } from '@/utils/date';
import { getHeatColor } from '../lib/heat';

interface DayCellProps {
  date: Date;
  views: number;
  pages: number;
  selected: boolean;
  currentMonth: boolean;
  maxViews: number;
  theme: 'light' | 'dark';
  monthLabel?: string;
  onSelect: (date: Date) => void;
}

export const DayCell = memo(function DayCell({
  date,
  views,
  pages,
  selected,
  currentMonth,
  maxViews,
  theme,
  monthLabel,
  onSelect,
}: DayCellProps) {
  const classes = [
    'day-cell-wrap',
    currentMonth ? '' : 'is-outside',
    selected ? 'is-selected' : '',
    date.toDateString() === new Date().toDateString() ? 'is-today' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const label = `${formatDateHeader(date)}${views > 0 ? `、${views}閲覧、${pages}ページ` : ''}`;

  return (
    <div className={classes} data-day={dayKey(date)}>
      <button
        aria-label={label}
        aria-pressed={selected}
        className="day-cell"
        onClick={() => onSelect(date)}
        style={selected ? undefined : { backgroundColor: getHeatColor(views, maxViews, theme) }}
        title={label}
        type="button"
      >
        <span className="day-number">{date.getDate()}</span>
        {monthLabel ? <span className="day-month-label">{monthLabel}</span> : null}
      </button>
    </div>
  );
});
