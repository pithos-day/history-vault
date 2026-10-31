import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  dayKey,
  formatDateGroupHeader,
  formatDateRange,
  formatTimeWithSeconds,
  getMonthGrid,
  getMonthRange,
  getWeekRange,
  parseDayKey,
  startOfDay,
} from '../utils/date';

describe('date helpers', () => {
  it('builds a six-week grid starting on Sunday', () => {
    const grid = getMonthGrid(new Date(2025, 8, 1));

    expect(grid).toHaveLength(42);
    expect(dayKey(grid[0] as Date)).toBe('2025-08-31');
    expect(dayKey(grid[41] as Date)).toBe('2025-10-11');
  });

  it('builds a month range with an exclusive end', () => {
    const range = getMonthRange(new Date(2025, 8, 15));
    expect(dayKey(range.start)).toBe('2025-09-01');
    expect(dayKey(range.end)).toBe('2025-10-01');
  });

  it('builds a week range from the configured start day', () => {
    const sunday = getWeekRange(new Date(2025, 8, 25), 0);
    const monday = getWeekRange(new Date(2025, 8, 25), 1);

    expect(dayKey(sunday.start)).toBe('2025-09-21');
    expect(dayKey(monday.start)).toBe('2025-09-22');
  });

  it('parses valid day keys and rejects invalid dates', () => {
    expect(dayKey(parseDayKey('2025-09-25') as Date)).toBe('2025-09-25');
    expect(parseDayKey('2025-02-30')).toBeNull();
    expect(parseDayKey('2025/09/25')).toBeNull();
  });

  it('formats a date range inclusively', () => {
    const range = getMonthRange(new Date(2025, 8, 15));
    expect(formatDateRange(range.start, range.end)).toContain('2025');
    expect(formatDateRange(range.start, range.end)).toContain('9');
  });

  it('handles day arithmetic across month boundaries', () => {
    expect(dayKey(addCalendarDays(startOfDay(new Date(2025, 8, 30)), 1))).toBe('2025-10-01');
  });

  it('formats detailed times and long weekdays', () => {
    const date = new Date(2025, 8, 27, 23, 42, 30);

    expect(formatTimeWithSeconds(date)).toBe('23時42分30秒');
    expect(formatDateGroupHeader(date)).toBe('2025年9月27日 土曜日');
  });
});
