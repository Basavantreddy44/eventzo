import type { JobAction } from "../schemas";

const DAY_MS = 24 * 60 * 60 * 1000;
const ZONE = "Asia/Kolkata";

/** "2027-01-15T04:30:00Z" → "2027-01-15" (the IST calendar date). */
export function zonedDate(iso: string | Date, timeZone = ZONE): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "2027-01-15T04:30:00Z" → "10:00" (IST wall clock, 24h). */
export function zonedTime(iso: string | Date, timeZone = ZONE): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/**
 * Which buttons the staff app shows. Mirrors public.respond_job(): check-in
 * opens a day before the start, completing needs the job to have started.
 */
export function availableJobActions(
  job: { status: string; startsAt: string; cancelled: boolean },
  now: Date = new Date(),
): JobAction[] {
  if (job.cancelled) return [];
  const start = new Date(job.startsAt).getTime();
  const t = now.getTime();
  const canCheckIn = t >= start - DAY_MS;
  const started = t >= start;
  switch (job.status) {
    case "assigned":
      return canCheckIn ? ["accept", "check_in", "decline"] : ["accept", "decline"];
    case "accepted":
      return [...(canCheckIn ? (["check_in"] as const) : []), ...(started ? (["complete"] as const) : []), "decline"];
    case "checked_in":
      return started ? ["complete"] : [];
    default:
      return [];
  }
}

/** Groups rows by their IST date, keeping order. */
export function groupByDate<T>(rows: T[], dateOf: (row: T) => string): { date: string; rows: T[] }[] {
  const groups: { date: string; rows: T[] }[] = [];
  for (const row of rows) {
    const date = zonedDate(dateOf(row));
    const last = groups.at(-1);
    if (last?.date === date) last.rows.push(row);
    else groups.push({ date, rows: [row] });
  }
  return groups;
}

/** A job is "today" when it overlaps the current IST day. */
export function isToday(startsAt: string, endsAt: string, now: Date = new Date()): boolean {
  const today = zonedDate(now);
  return zonedDate(startsAt) <= today && zonedDate(new Date(new Date(endsAt).getTime() - 1)) >= today;
}

/** tel: link for an E.164 number (digits and a leading + only). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
