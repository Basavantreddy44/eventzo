/**
 * Date-only calendar helpers. All values are ISO dates ("YYYY-MM-DD") so there
 * is no time-zone drift; "today" is computed in the event's time zone.
 */

export type YearMonth = { year: number; month: number }; // month: 1–12

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Today's date in a time zone, e.g. todayIn("Asia/Kolkata") → "2026-11-11". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Parses "2026-12" (falls back to the month of `today`). */
export function parseMonth(param: string | undefined, today: string): YearMonth {
  const m = param && /^(\d{4})-(\d{2})$/.exec(param);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function formatMonthParam({ year, month }: YearMonth): string {
  return `${year}-${pad(month)}`;
}

export function monthRange({ year, month }: YearMonth): { from: string; to: string } {
  return { from: isoDate(year, month, 1), to: isoDate(year, month, daysInMonth(year, month)) };
}

/**
 * Weeks of the month as ISO dates, padded with nulls. Weeks start on Sunday
 * (as in Indian wall calendars and panchangas) unless `weekStartsOn` = 1.
 */
export function monthGrid({ year, month }: YearMonth, weekStartsOn: 0 | 1 = 0): (string | null)[][] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sunday
  const leading = (firstWeekday - weekStartsOn + 7) % 7;
  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= daysInMonth(year, month); d++) cells.push(isoDate(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
