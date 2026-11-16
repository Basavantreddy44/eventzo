"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { intlLocale } from "@/lib/datetime";
import { listingMonth, type CalendarDay } from "../actions/customer";
import { usePickedDate } from "./picked-date";

const MONTHS_AHEAD = 18;

function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const STATUS_STYLE: Record<CalendarDay["status"], string> = {
  free: "bg-success/10 text-foreground hover:bg-success/20 border-success/30",
  held: "bg-warning/15 text-muted-foreground border-warning/40",
  booked: "bg-muted text-muted-foreground line-through border-transparent",
  unknown: "bg-card text-foreground hover:bg-accent border-border",
};

/**
 * Month view of a listing's availability (Roadmap C2): free / held / booked,
 * muhurtham dates marked with the surcharge. Picking a free day fills the
 * enquiry form's date.
 */
export function AvailabilityCalendar({ serviceId, today }: { serviceId: string; today: string }) {
  const t = useTranslations("listing.calendar");
  const locale = useLocale();
  const { pick } = usePickedDate();
  const first = today.slice(0, 7);
  const [month, setMonth] = useState(first);
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    startLoading(async () => {
      const result = await listingMonth(serviceId, month);
      setFailed(!result.ok);
      setDays(result.ok ? result.data : null);
    });
  }, [serviceId, month]);

  const fmt = intlLocale(locale);
  const title = new Intl.DateTimeFormat(fmt, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
  // Monday-first weekday initials in the page language.
  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat(fmt, { weekday: "narrow", timeZone: "UTC" }).format(
          new Date(Date.UTC(2024, 0, 1 + i)), // 1 Jan 2024 was a Monday
        ),
      ),
    [fmt],
  );
  const lead = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const surcharge = days?.find((d) => d.auspicious && d.surchargeBps > 0)?.surchargeBps ?? 0;
  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat(fmt, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );

  return (
    <section className="grid gap-3" aria-labelledby="availability-title" data-testid="availability-calendar">
      <div className="flex items-center justify-between gap-2">
        <h2 id="availability-title" className="text-xl font-semibold">
          {t("title")}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setMonth(addMonths(month, -1))}
            disabled={month <= first}
            aria-label={t("previous")}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <p className="min-w-36 text-center text-sm font-medium" aria-live="polite" data-testid="calendar-month">
            {title}
          </p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setMonth(addMonths(month, 1))}
            disabled={month >= addMonths(first, MONTHS_AHEAD)}
            aria-label={t("next")}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <div className="relative">
        <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={title} aria-busy={loading}>
          {weekdays.map((w, i) => (
            <div key={i} className="text-muted-foreground py-1 text-xs font-medium" role="columnheader">
              {w}
            </div>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <div key={`lead-${i}`} aria-hidden />
          ))}
          {(days ?? []).map((d) => {
            const past = d.day < today;
            const pickable = !past && (d.status === "free" || d.status === "unknown");
            const label = `${dayLabel(d.day)}: ${past ? t("past") : t(`status.${d.status}`)}${
              d.auspicious ? `, ${t("muhurtham")}` : ""
            }`;
            return (
              <button
                key={d.day}
                type="button"
                role="gridcell"
                disabled={!pickable}
                onClick={() => {
                  pick(d.day);
                  document
                    .getElementById("enquiry-panel-anchor")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                aria-label={label}
                title={label}
                data-day={d.day}
                data-status={past ? "past" : d.status}
                className={cn(
                  "relative flex aspect-square items-center justify-center rounded-md border text-sm transition-colors disabled:cursor-not-allowed",
                  past ? "text-muted-foreground/50 border-transparent" : STATUS_STYLE[d.status],
                  d.day === today && "ring-primary ring-1",
                )}
              >
                {Number(d.day.slice(8))}
                {d.auspicious ? (
                  <span className="bg-gold absolute top-1 right-1 size-1.5 rounded-full" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
        {loading ? (
          <div className="bg-background/60 absolute inset-0 flex items-center justify-center rounded-md">
            <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />
          </div>
        ) : null}
      </div>

      {failed ? <p className="text-destructive text-sm">{t("error")}</p> : null}
      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={t("legend")}>
        <li className="flex items-center gap-1.5">
          <span className="bg-success/30 size-3 rounded-sm" aria-hidden /> {t("status.free")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="bg-warning/40 size-3 rounded-sm" aria-hidden /> {t("status.held")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="bg-muted size-3 rounded-sm border" aria-hidden /> {t("status.booked")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="bg-gold size-2 rounded-full" aria-hidden /> {t("muhurtham")}
          {surcharge > 0 ? ` · ${t("surcharge", { percent: surcharge / 100 })}` : ""}
        </li>
      </ul>
      <p className="text-muted-foreground text-xs">{t("hint")}</p>
    </section>
  );
}
