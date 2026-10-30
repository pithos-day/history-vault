import { useEffect, useRef } from 'react';
import {
  addDays,
  dayKey,
  formatMonthLabel,
  formatWeekday,
  getMonthGrid,
  monthKey,
  startOfWeek,
} from '@/utils/date';
import type { CalendarDayActivity } from '@/utils/history/types';
import { DayCell } from './DayCell';

interface CalendarSidebarProps {
  months: Date[];
  activity: Map<string, CalendarDayActivity>;
  selectedDate: Date;
  weekStartsOn: 0 | 1;
  maxViews: number;
  theme: 'light' | 'dark';
  onSelect: (date: Date) => void;
}

export function CalendarSidebar({
  months,
  activity,
  selectedDate,
  weekStartsOn,
  maxViews,
  theme,
  onSelect,
}: CalendarSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedMonth = monthKey(selectedDate);
  const weekStart = startOfWeek(new Date(), weekStartsOn);
  const weekdays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  useEffect(() => {
    if (months.length === 0) return;
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-month="${selectedMonth}"]`);
    if (!container || !target) return;

    const top = target.offsetTop;
    container.scrollTo({ top: Math.max(0, top) });
  }, [selectedMonth, months.length]);

  return (
    <aside aria-label="履歴カレンダー" className="calendar">
      <div className="calendar-weekdays">
        {weekdays.map((date) => (
          <div className="calendar-weekday" key={date.toISOString()}>
            {formatWeekday(date)}
          </div>
        ))}
      </div>

      <div className="calendar-scroll" ref={scrollRef}>
        {months.map((month, index) => {
          const monthDays = getMonthGrid(month, weekStartsOn);

          return (
            <section className="calendar-month" data-month={monthKey(month)} key={monthKey(month)}>
              <div className="calendar-month-label">
                {index === 0 || month.getMonth() === 0
                  ? formatMonthLabel(month)
                  : `${month.getMonth() + 1}月`}
              </div>
              <div className="calendar-grid">
                {monthDays.map((date) => {
                  const key = dayKey(date);
                  const day = activity.get(key);

                  return (
                    <DayCell
                      currentMonth={date.getMonth() === month.getMonth()}
                      date={date}
                      key={key}
                      maxViews={maxViews}
                      onSelect={onSelect}
                      pages={day?.pages ?? 0}
                      selected={key === dayKey(selectedDate)}
                      theme={theme}
                      views={day?.views ?? 0}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
