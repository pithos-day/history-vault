import { useEffect, useState } from 'react';
import { getCalendarActivity } from '@/utils/history/query';
import type { CalendarDayActivity } from '@/utils/history/types';

export function useCalendarActivity(
  start: number,
  end: number,
  revision: number,
): Map<string, CalendarDayActivity> {
  const [activity, setActivity] = useState<Map<string, CalendarDayActivity>>(() => new Map());

  useEffect(() => {
    let active = true;
    void revision;
    void getCalendarActivity(start, end).then((value) => {
      if (active) setActivity(value);
    });

    return () => {
      active = false;
    };
  }, [start, end, revision]);

  return activity;
}
