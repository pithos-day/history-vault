const UI_LOCALE = 'ja-JP';

const dateHeaderFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

const dateGroupFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
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

const weekdayLongFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  weekday: 'long',
});

export function startOfDay(input: Date | number): Date {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(input: Date | number): Date {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Adds calendar days and truncates the time to 00:00. */
export function addCalendarDays(input: Date | number, days: number): Date {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Returns the first day of the month `months` months after `input`. */
export function addMonthsToMonthStart(input: Date | number, months: number): Date {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function startOfWeek(input: Date | number, weekStartsOn: 0 | 1 = 0): Date {
  const date = startOfDay(input);
  const diff = (date.getDay() - weekStartsOn + 7) % 7;
  return addCalendarDays(date, -diff);
}

/** Returns the next day's 00:00, i.e. the exclusive end of the input day. */
export function startOfNextDay(input: Date | number): Date {
  return addCalendarDays(startOfDay(input), 1);
}

function startOfNextMonth(input: Date | number): Date {
  return addMonthsToMonthStart(startOfMonth(input), 1);
}

/** Returns the half-open range [start, end) for the given day. */
export function getDayRange(input: Date | number): { start: number; end: number } {
  return {
    start: startOfDay(input).getTime(),
    end: startOfNextDay(input).getTime(),
  };
}

/** Returns the half-open range [start, end) for the given month. */
export function getMonthRange(input: Date | number): { start: number; end: number } {
  return {
    start: startOfMonth(input).getTime(),
    end: startOfNextMonth(input).getTime(),
  };
}

/** Returns the half-open range [start, end) for the week containing the input. */
export function getWeekRange(
  input: Date | number,
  weekStartsOn: 0 | 1 = 0,
): { start: number; end: number } {
  const start = startOfWeek(input, weekStartsOn);
  return {
    start: start.getTime(),
    end: addCalendarDays(start, 7).getTime(),
  };
}

export function getMonthGrid(input: Date | number, weekStartsOn: 0 | 1 = 0): Date[] {
  const first = startOfMonth(input);
  const gridStart = startOfWeek(first, weekStartsOn);
  return Array.from({ length: 42 }, (_, index) => addCalendarDays(gridStart, index));
}

export function isSameMonth(a: Date | number, b: Date | number): boolean {
  const left = new Date(a);
  const right = new Date(b);
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

export function dayKey(input: Date | number): string {
  const date = new Date(input);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

function daysInMonth(input: Date | number): number {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function clampDateToMonth(input: Date | number): Date {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), Math.min(date.getDate(), daysInMonth(date)));
}

export function formatDateHeader(input: Date | number): string {
  return dateHeaderFormatter.format(new Date(input));
}

export function formatDateGroupHeader(input: Date | number): string {
  const date = new Date(input);
  return `${dateGroupFormatter.format(date)} ${weekdayLongFormatter.format(date)}`;
}

export function formatRelativeDateHeader(input: Date | number): string {
  const today = startOfDay(Date.now());
  const target = startOfDay(input);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diff === 0) return '今日';
  if (diff === -1) return '昨日';
  return formatDateHeader(input);
}

function formatNumericDate(input: Date | number): string {
  return numericDateFormatter.format(new Date(input));
}

export function formatShortDate(input: Date | number): string {
  return shortDateFormatter.format(new Date(input));
}

/** Formats the half-open range [start, endExclusive) as an inclusive date span. */
export function formatInclusiveDateSpan(start: number, endExclusive: number): string {
  return `${formatNumericDate(start)} – ${formatNumericDate(endExclusive - 1)}`;
}

export function formatTime(input: Date | number): string {
  return timeFormatter.format(new Date(input));
}

export function formatTimeWithSeconds(input: Date | number): string {
  const date = new Date(input);
  return `${pad(date.getHours())}時${pad(date.getMinutes())}分${pad(date.getSeconds())}秒`;
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
