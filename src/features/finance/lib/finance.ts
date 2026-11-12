/**
 * Finance helpers shared by pages, reports and tests. Dates are IST calendar
 * dates ("YYYY-MM-DD"); money is integer paise.
 */

export const RANGE_PRESETS = ["this_month", "last_month", "last_90", "this_fy", "last_fy"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export type DateRange = { from: string; to: string };

const MAX_RANGE_DAYS = 731; // matches public.vendor_report()

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Indian financial year (April–March) of a date: "2026-11-12" → "2026-27". Mirrors private.fiscal_year(). */
export function fiscalYear(date: string): string {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${pad((start + 1) % 100)}`;
}

export function fiscalYearRange(date: string): DateRange {
  const start = Number(fiscalYear(date).slice(0, 4));
  return { from: ymd(start, 4, 1), to: ymd(start + 1, 3, 31) };
}

export function presetRange(preset: RangePreset, today: string): DateRange {
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "this_month":
      return { from: ymd(y, m, 1), to: ymd(y, m, daysIn(y, m)) };
    case "last_month": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: ymd(py, pm, 1), to: ymd(py, pm, daysIn(py, pm)) };
    }
    case "last_90":
      return { from: addDays(today, -89), to: today };
    case "this_fy":
      return fiscalYearRange(today);
    case "last_fy":
      return fiscalYearRange(addDays(fiscalYearRange(today).from, -1));
  }
}

const isDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/**
 * Reads ?range=<preset> or ?from=&to= from search params. Invalid or too-long
 * custom ranges fall back to the default preset.
 */
export function resolveRange(
  params: { range?: string | string[]; from?: string | string[]; to?: string | string[] },
  today: string,
  fallback: RangePreset = "this_month",
): DateRange & { preset: RangePreset | "custom" } {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const from = one(params.from);
  const to = one(params.to);
  if (isDate(from) && isDate(to) && from <= to && daysBetweenInclusive(from, to) <= MAX_RANGE_DAYS) {
    return { from, to, preset: "custom" };
  }
  const preset = one(params.range);
  const p = (RANGE_PRESETS as readonly string[]).includes(preset ?? "") ? (preset as RangePreset) : fallback;
  return { ...presetRange(p, today), preset: p };
}

/** "2026-11" → localised "Nov 2026". */
export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** Net cash for a period: received − refunded − expenses (may be negative). */
export function netCash(t: { received_paise: number; refunded_paise: number; expenses_paise: number }): number {
  return t.received_paise - t.refunded_paise - t.expenses_paise;
}

/** Share as a whole percentage, or null when the base is 0. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Paise → plain rupees for CSV ("125000.50"; no grouping or symbol). */
export function paiseToPlain(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const s = `${Math.floor(abs / 100)}.${pad(abs % 100)}`;
  return `${negative ? "-" : ""}${s.replace(/\.00$/, "")}`;
}

/**
 * RFC 4180 CSV. Text cells that a spreadsheet would run as a formula
 * (=, +, -, @, tab, CR) are prefixed with an apostrophe (CSV injection).
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v);
    let s = v;
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? below100(r) : ""].filter(Boolean).join(" ");
}

/**
 * Indian-system amount in words for receipts (English):
 * 1250050 paise → "Rupees Twelve Thousand Five Hundred and Paise Fifty Only".
 */
export function amountInWordsINR(paise: number): string {
  const total = Math.max(0, Math.trunc(paise));
  let rupees = Math.floor(total / 100);
  const p = total % 100;
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  rupees %= 10_000_000;
  const lakh = Math.floor(rupees / 100_000);
  rupees %= 100_000;
  const thousand = Math.floor(rupees / 1000);
  const rest = rupees % 1000;
  if (crore)
    parts.push(
      `${crore >= 1000 ? amountInWordsINR(crore * 100).replace(/^Rupees |\s*Only$/g, "") : below1000(crore)} Crore`,
    );
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  const words = parts.join(" ") || "Zero";
  return `Rupees ${words}${p ? ` and Paise ${below100(p)}` : ""} Only`;
}
