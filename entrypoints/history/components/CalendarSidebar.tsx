import { useEffect, useMemo, useRef } from 'react';
import {
  addCalendarDays,
  addMonthsToMonthStart,
  dayKey,
  formatWeekday,
  startOfMonth,
  startOfWeek,
} from '@/utils/date';
import type { CalendarDayActivity } from '@/utils/history/types';
import { DayCell } from './DayCell';

interface CalendarSidebarProps {
  months: Date[];
  activity: Map<string, CalendarDayActivity>;
  selectedDate: Date;
  weekStartsOn: 0 | 1;
  theme: 'light' | 'dark';
  onSelect: (date: Date) => void;
}

export function CalendarSidebar({
  months,
  activity,
  selectedDate,
  weekStartsOn,
  theme,
  onSelect,
}: CalendarSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedKey = dayKey(selectedDate);
  const weekStart = startOfWeek(new Date(), weekStartsOn);
  const weekdays = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
  const days = useMemo(() => buildCalendarDays(months, weekStartsOn), [months, weekStartsOn]);
  const maxViews = useMemo(() => {
    let max = 0;
    for (const date of days) {
      const day = activity.get(dayKey(date));
      if (day && day.views > max) max = day.views;
    }
    return max;
  }, [days, activity]);
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];
  const monthCount = months.length;
  const rangeStart = firstMonth ? startOfMonth(firstMonth).getTime() : 0;
  const rangeEnd = lastMonth ? addMonthsToMonthStart(lastMonth, 1).getTime() : 0;

  useEffect(() => {
    if (monthCount === 0) return;
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-day="${selectedKey}"]`);
    if (!container || !target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (targetRect.top >= containerRect.top && targetRect.bottom <= containerRect.bottom) return;

    container.scrollTo({ top: Math.max(0, target.offsetTop - 4) });
  }, [selectedKey, monthCount]);

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
        <div className="calendar-grid">
          {days.map((date) => {
            const key = dayKey(date);
            const day = activity.get(key);

            return (
              <DayCell
                currentMonth={date.getTime() >= rangeStart && date.getTime() < rangeEnd}
                date={date}
                key={key}
                maxViews={maxViews}
                monthLabel={date.getDate() === 1 ? `${date.getMonth() + 1}月` : undefined}
                onSelect={onSelect}
                pages={day?.pages ?? 0}
                selected={key === selectedKey}
                theme={theme}
                views={day?.views ?? 0}
              />
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function buildCalendarDays(months: Date[], weekStartsOn: 0 | 1): Date[] {
  if (months.length === 0) return [];

  const first = startOfMonth(months[0] as Date);
  const last = startOfMonth(months[months.length - 1] as Date);
  const gridStart = startOfWeek(first, weekStartsOn);
  const lastDay = addCalendarDays(addMonthsToMonthStart(last, 1), -1);
  const gridEnd = addCalendarDays(startOfWeek(lastDay, weekStartsOn), 7);
  const days: Date[] = [];

  for (let date = gridStart; date < gridEnd; date = addCalendarDays(date, 1)) {
    days.push(date);
  }

  return days;
}
