import { addDays, formatWeekday, isSameDay } from '@/utils/date';
import type { DayStats } from '@/utils/history/types';
import { DayCell } from './DayCell';

interface WeekViewProps {
  weekStart: Date;
  days: Map<string, DayStats>;
  selectedDate: Date;
  maxViews: number;
  theme: 'light' | 'dark';
  onSelect: (date: Date) => void;
}

export function WeekView({
  weekStart,
  days,
  selectedDate,
  maxViews,
  theme,
  onSelect,
}: WeekViewProps) {
  const dates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <section aria-label="週間カレンダー" className="week-view">
      <div className="week-grid">
        {dates.map((date) => (
          <div className="week-column" key={date.toISOString()}>
            <div className="week-weekday">{formatWeekday(date)}</div>
            <DayCell
              currentMonth
              date={date}
              maxViews={maxViews}
              onSelect={onSelect}
              selected={isSameDay(date, selectedDate)}
              stats={days.get(dateKey(date))}
              theme={theme}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
