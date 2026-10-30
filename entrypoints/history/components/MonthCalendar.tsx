import {
  addDays,
  formatWeekday,
  getMonthGrid,
  isSameDay,
  isSameMonth,
  startOfWeek,
} from '@/utils/date';
import type { DayStats } from '@/utils/history/types';
import { DayCell } from './DayCell';

interface MonthCalendarProps {
  month: Date;
  days: Map<string, DayStats>;
  selectedDate: Date;
  weekStartsOn: 0 | 1;
  maxViews: number;
  theme: 'light' | 'dark';
  onSelect: (date: Date) => void;
}

export function MonthCalendar({
  month,
  days,
  selectedDate,
  weekStartsOn,
  maxViews,
  theme,
  onSelect,
}: MonthCalendarProps) {
  const grid = getMonthGrid(month, weekStartsOn);
  const weekStart = startOfWeek(new Date(), weekStartsOn);
  const weekdays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <section aria-label="履歴カレンダー" className="calendar">
      <div className="calendar-weekdays">
        {weekdays.map((date) => (
          <div className="calendar-weekday" key={date.toISOString()}>
            {formatWeekday(date)}
          </div>
        ))}
      </div>
      <div className="calendar-grid">
        {grid.map((date) => (
          <DayCell
            currentMonth={isSameMonth(date, month)}
            date={date}
            key={date.toISOString()}
            maxViews={maxViews}
            onSelect={onSelect}
            selected={isSameDay(date, selectedDate)}
            stats={days.get(dateKey(date))}
            theme={theme}
          />
        ))}
      </div>
    </section>
  );
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
