import { getTranslations } from "next-intl/server";
import { CalendarClock, MapPin, Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { siteConfig } from "@/config/site";
import { getPublicEnv } from "@/lib/env";
import { getEventDaySheet } from "../queries";
import { DaySheetActions } from "./day-sheet-actions";
import type { WorkspaceEvent } from "./event-tabs";

function localized(name: string, i18n: unknown, locale: string) {
  const map = i18n && typeof i18n === "object" && !Array.isArray(i18n) ? (i18n as Record<string, unknown>) : {};
  return typeof map[locale] === "string" && map[locale] ? (map[locale] as string) : name;
}

/** "+919845012345" → "+91 98450 12345" for reading aloud on the day. */
function prettyPhone(p: string) {
  const m = /^\+91(\d{5})(\d{5})$/.exec(p);
  return m ? `+91 ${m[1]} ${m[2]}` : p;
}

/**
 * Roadmap C9: one page for the event day — every confirmed vendor's arrival
 * time, contact person and phone, grouped by day. Shared with the family
 * through the event's people (co-hosts and viewers); printable.
 */
export async function DaySheetTab({ event, locale }: { event: WorkspaceEvent; locale: string }) {
  const [t, rows] = await Promise.all([getTranslations("events.daySheet"), getEventDaySheet(event.id)]);
  const tz = siteConfig.defaultTimeZone;
  const time = (iso: string) => formatDateTime(iso, locale, tz, { timeStyle: "short" });
  const day = (d: string) =>
    formatDateTime(`${d}T00:00:00Z`, locale, "UTC", { weekday: "long", day: "numeric", month: "long" });

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title={t("emptyTitle")}
        description={t("emptyBody")}
        action={
          <Button asChild variant="outline">
            <Link href={`/account/events/${event.id}?tab=quotes`}>{t("toQuotes")}</Link>
          </Button>
        }
      />
    );
  }

  const days = new Map<string, typeof rows>();
  for (const r of rows) days.set(r.event_date, [...(days.get(r.event_date) ?? []), r]);
  const shareUrl = `${getPublicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/${locale === "en" ? "" : `${locale}/`}account/events/${event.id}?tab=day`;

  return (
    <div className="grid gap-6" data-testid="day-sheet">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-muted-foreground text-sm">{t("intro")}</p>
        <DaySheetActions url={shareUrl} title={event.title} />
      </div>
      <h2 className="hidden text-xl font-semibold print:block">{event.title}</h2>
      {[...days.entries()].map(([date, list]) => (
        <section key={date} className="grid gap-3" aria-labelledby={`day-${date}`}>
          <h3 id={`day-${date}`} className="text-lg font-semibold">
            {day(date)}
          </h3>
          <ol className="grid gap-3">
            {list.map((r) => (
              <li
                key={r.booking_item_id}
                className="bg-card grid gap-2 rounded-xl border p-4 sm:grid-cols-[6rem_1fr_auto] sm:items-start"
                data-testid="day-sheet-row"
              >
                <div className="grid">
                  <span className="text-primary-strong text-xl font-semibold" data-testid="day-sheet-arrival">
                    {time(r.arrival_at)}
                  </span>
                  <span className="text-muted-foreground text-xs">{t("arrives")}</span>
                </div>
                <div className="grid gap-1">
                  <span className="text-muted-foreground text-xs tracking-wide uppercase">
                    {localized(r.category_name, r.category_i18n, locale)}
                  </span>
                  <span className="font-semibold">{r.listing_title}</span>
                  <span className="text-sm">
                    {r.vendor_name} · {t("hours", { start: time(r.starts_at), end: time(r.ends_at) })}
                  </span>
                  {r.site_address ? (
                    <span className="text-muted-foreground flex items-start gap-1 text-xs">
                      <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden />
                      {r.site_address}
                    </span>
                  ) : null}
                  {r.instructions ? <p className="text-muted-foreground text-xs">{r.instructions}</p> : null}
                </div>
                <div className="grid gap-1 sm:text-right">
                  <span className="text-sm font-medium" data-testid="day-sheet-contact">
                    {r.contact_name}
                    {r.contact_role ? (
                      <span className="text-muted-foreground font-normal"> · {r.contact_role}</span>
                    ) : null}
                  </span>
                  {r.contact_phone ? (
                    <a
                      href={`tel:${r.contact_phone}`}
                      className="text-primary inline-flex items-center gap-1 text-sm font-medium sm:justify-end"
                      data-testid="day-sheet-phone"
                    >
                      <Phone className="size-3.5" aria-hidden />
                      {prettyPhone(r.contact_phone)}
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">{t("noPhone")}</span>
                  )}
                  {r.vendor_phone && r.vendor_phone !== r.contact_phone ? (
                    <a href={`tel:${r.vendor_phone}`} className="text-muted-foreground text-xs">
                      {t("office", { phone: prettyPhone(r.vendor_phone) })}
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className="text-muted-foreground text-xs print:hidden">{t("privacy")}</p>
    </div>
  );
}
