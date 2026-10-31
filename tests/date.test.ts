import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  dayKey,
  formatDateGroupHeader,
  formatInclusiveDateSpan,
  formatTimeWithSeconds,
  getMonthRange,
  parseDayKey,
  startOfDay,
  startOfWeek,
} from '../utils/date';

describe('date helpers', () => {
  it('builds a month range with an exclusive end', () => {
    const range = getMonthRange(new Date(2025, 8, 15));
    expect(dayKey(range.start)).toBe('2025-09-01');
    expect(dayKey(range.end)).toBe('2025-10-01');
  });

  it('finds the start of the week from the configured day', () => {
    const date = new Date(2025, 8, 25);

    expect(dayKey(startOfWeek(date, 0))).toBe('2025-09-21');
    expect(dayKey(startOfWeek(date, 1))).toBe('2025-09-22');
  });

  it('parses valid day keys and rejects invalid dates', () => {
    expect(dayKey(parseDayKey('2025-09-25') as Date)).toBe('2025-09-25');
    expect(parseDayKey('2025-02-30')).toBeNull();
    expect(parseDayKey('2025/09/25')).toBeNull();
  });

  it('formats a date range inclusively', () => {
    const range = getMonthRange(new Date(2025, 8, 15));
    expect(formatInclusiveDateSpan(range.start, range.end)).toBe('2025/9/1 – 2025/9/30');
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
