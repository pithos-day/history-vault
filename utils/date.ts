export const UI_LOCALE = 'ja-JP';

const monthLabelFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  year: 'numeric',
  month: 'long',
});

const dateHeaderFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

const numericDateFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  month: 'numeric',
  day: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const weekdayFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  weekday: 'short',
});

export function startOfDay(input: Date | number): Date {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(input: Date | number): Date {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(input: Date | number, days: number): Date {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function addMonths(input: Date | number, months: number): Date {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function startOfWeek(input: Date | number, weekStartsOn: 0 | 1 = 0): Date {
  const date = startOfDay(input);
  const diff = (date.getDay() - weekStartsOn + 7) % 7;
  return addDays(date, -diff);
}

export function endOfDay(input: Date | number): Date {
  return addDays(startOfDay(input), 1);
}

export function endOfMonth(input: Date | number): Date {
  return addMonths(startOfMonth(input), 1);
}

export function getDayRange(input: Date | number): { start: number; end: number } {
  return {
    start: startOfDay(input).getTime(),
    end: endOfDay(input).getTime(),
  };
}

export function getMonthRange(input: Date | number): { start: number; end: number } {
  return {
    start: startOfMonth(input).getTime(),
    end: endOfMonth(input).getTime(),
  };
}

export function getWeekRange(
  input: Date | number,
  weekStartsOn: 0 | 1 = 0,
): { start: number; end: number } {
  const start = startOfWeek(input, weekStartsOn);
  return {
    start: start.getTime(),
    end: addDays(start, 7).getTime(),
  };
}

export function getMonthGrid(input: Date | number, weekStartsOn: 0 | 1 = 0): Date[] {
  const first = startOfMonth(input);
  const gridStart = startOfWeek(first, weekStartsOn);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function isSameDay(a: Date | number, b: Date | number): boolean {
  return dayKey(a) === dayKey(b);
}

export function isSameMonth(a: Date | number, b: Date | number): boolean {
  const left = new Date(a);
  const right = new Date(b);
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

export function isToday(input: Date | number): boolean {
  return isSameDay(input, Date.now());
}

export function dayKey(input: Date | number): string {
  const date = new Date(input);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthKey(input: Date | number): string {
  const date = new Date(input);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function parseDayKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

export function daysInMonth(input: Date | number): number {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function clampDateToMonth(input: Date | number): Date {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), Math.min(date.getDate(), daysInMonth(date)));
}

export function formatMonthLabel(input: Date | number): string {
  return monthLabelFormatter.format(new Date(input));
}

export function formatDateHeader(input: Date | number): string {
  return dateHeaderFormatter.format(new Date(input));
}

export function formatRelativeDateHeader(input: Date | number): string {
  const today = startOfDay(Date.now());
  const target = startOfDay(input);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diff === 0) return '今日';
  if (diff === -1) return '昨日';
  return formatDateHeader(input);
}

export function formatNumericDate(input: Date | number): string {
  return numericDateFormatter.format(new Date(input));
}

export function formatShortDate(input: Date | number): string {
  return shortDateFormatter.format(new Date(input));
}

export function formatDateRange(start: number, end: number): string {
  return `${formatNumericDate(start)} – ${formatNumericDate(end - 1)}`;
}

export function formatTime(input: Date | number): string {
  return timeFormatter.format(new Date(input));
}

export function formatHour(hour: number): string {
  return `${hour}時`;
}

export function formatWeekday(input: Date | number): string {
  return weekdayFormatter.format(new Date(input));
}

export function formatCount(value: number): string {
  return value.toLocaleString(UI_LOCALE);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
