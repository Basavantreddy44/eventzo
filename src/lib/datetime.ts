import { siteConfig } from "@/config/site";

/** Formats a timestamptz in the event's time zone (default Asia/Kolkata). */
export function formatDateTime(
  iso: string | Date,
  locale: string,
  timeZone: string = siteConfig.defaultTimeZone,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(intlLocale(locale), { ...options, timeZone }).format(date);
}

/** App locales → BCP-47 tags with Indian regional formatting. */
export function intlLocale(locale: string): string {
  switch (locale) {
    case "kn":
      return "kn-IN";
    case "hi":
      return "hi-IN";
    default:
      return "en-IN";
  }
}

/** "2027-01-15 04:30:00+00" → "2027-01-15T04:30:00+00:00" (JS Date needs HH:MM offsets). */
function toIso(pgTimestamp: string): string {
  return pgTimestamp
    .trim()
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
}

/**
 * Parses a Postgres tstzrange literal such as
 * `["2027-01-15 04:30:00+00","2027-01-15 08:30:00+00")` into Date bounds.
 */
export function parseTstzRange(range: string): { start: Date; end: Date } | null {
  const match = /^[[(]"?([^",]+)"?,"?([^",]+)"?[\])]$/.exec(range.trim());
  if (!match) return null;
  const start = new Date(toIso(match[1]));
  const end = new Date(toIso(match[2]));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}
