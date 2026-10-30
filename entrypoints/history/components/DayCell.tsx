import { formatDateHeader } from '@/utils/date';
import { getHeatColor } from '../lib/heat';

interface DayCellProps {
  date: Date;
  views: number;
  pages: number;
  selected: boolean;
  currentMonth: boolean;
  maxViews: number;
  theme: 'light' | 'dark';
  onSelect: (date: Date) => void;
}

export function DayCell({
  date,
  views,
  pages,
  selected,
  currentMonth,
  maxViews,
  theme,
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
    <div className={classes}>
      <button
        aria-label={label}
        aria-pressed={selected}
        className="day-cell"
        onClick={() => onSelect(date)}
        style={{ backgroundColor: getHeatColor(views, maxViews, theme) }}
        title={label}
        type="button"
      >
        <span className="day-number">{date.getDate()}</span>
      </button>
    </div>
  );
}
