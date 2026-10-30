import {
  addDays,
  endOfMonth,
  formatCount,
  formatShortDate,
  formatWeekday,
  isSameDay,
  startOfMonth,
} from '@/utils/date';
import type { DayStats } from '@/utils/history/types';

interface DateRailProps {
  month: Date;
  days: Map<string, DayStats>;
  selectedDate: Date;
  onSelect: (date: Date) => void;
}

export function DateRail({ month, days, selectedDate, onSelect }: DateRailProps) {
  const dates: Date[] = [];
  for (let cursor = startOfMonth(month); cursor < endOfMonth(month); cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }

  return (
    <nav aria-label="日付一覧" className="date-rail">
      {dates.map((date) => {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const stats = days.get(key);
        return (
          <button
            aria-current={isSameDay(date, selectedDate) ? 'date' : undefined}
            className={`date-rail-item ${isSameDay(date, selectedDate) ? 'is-selected' : ''}`}
            key={key}
            onClick={() => onSelect(date)}
            type="button"
          >
            <span className="date-rail-date">{formatShortDate(date)}</span>
            <span className="date-rail-weekday">{formatWeekday(date)}</span>
            <span className="date-rail-count">{stats ? formatCount(stats.views) : '—'}</span>
          </button>
        );
      })}
    </nav>
  );
}
