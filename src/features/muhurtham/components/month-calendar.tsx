import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { monthGrid, type YearMonth } from "../lib/calendar";
import { significanceKey, type PublicAuspiciousDate } from "../queries";

const TONE = {
  low: "bg-gold/15 text-accent-foreground ring-gold/40",
  medium: "bg-gold/35 text-gold-foreground ring-gold/60",
  high: "bg-primary text-primary-foreground ring-primary",
} as const;

/** Sunday-first month grid with auspicious dates highlighted by demand. */
export async function MonthCalendar({
  month,
  dates,
  today,
}: {
  month: YearMonth;
  dates: PublicAuspiciousDate[];
  today: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("muhurtham"), getLocale()]);
  const fmtLocale = intlLocale(locale);
  const byDate = new Map<string, PublicAuspiciousDate>();
  for (const d of dates) {
    const existing = byDate.get(d.date);
    if (!existing || d.significance > existing.significance) byDate.set(d.date, d);
  }

  // 1 Jan 2023 was a Sunday: derive localized weekday names from it.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(fmtLocale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2023, 0, 1 + i)),
    ),
  );
  const fullDate = new Intl.DateTimeFormat(fmtLocale, { dateStyle: "full", timeZone: "UTC" });

  return (
    <div className="grid gap-3">
      <table className="w-full table-fixed border-separate border-spacing-1" data-testid="muhurtham-calendar">
        <thead>
          <tr>
            {weekdays.map((w) => (
              <th key={w} scope="col" className="text-muted-foreground py-1 text-center text-xs font-medium">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(month).map((week, wi) => (
            <tr key={wi}>
              {week.map((iso, di) => {
                if (!iso) return <td key={di} />;
                const entry = byDate.get(iso);
                const key = entry ? significanceKey(entry.significance) : null;
                const label = fullDate.format(new Date(`${iso}T00:00:00Z`));
                return (
                  <td key={iso} className="p-0">
                    <div
                      className={cn(
                        "flex aspect-square flex-col items-center justify-center rounded-lg text-sm sm:text-base",
                        key ? cn("font-semibold ring-1", TONE[key]) : "text-foreground/80",
                        iso === today && !key && "ring-primary/50 ring-1",
                      )}
                      title={entry ? `${label} – ${t(`significance.${key!}`)}` : label}
                      aria-label={entry ? `${label}, ${t(`significance.${key!}`)}` : label}
                      aria-current={iso === today ? "date" : undefined}
                      data-auspicious={entry ? key : undefined}
                    >
                      {Number(iso.slice(8))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        <span>{t("legend")}:</span>
        {(["low", "medium", "high"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("size-3 rounded-sm ring-1", TONE[k])} aria-hidden />
            {t(`significance.${k}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
