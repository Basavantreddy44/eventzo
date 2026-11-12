import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { CalendarDays, ChevronLeft, ChevronRight, Package } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime, intlLocale } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { releaseCalendarEntry } from "@/features/enquiries/actions/vendor";
import { CalendarEntryForm } from "@/features/enquiries/components/calendar-entry-form";
import { getCalendarReservations, rangeOf } from "@/features/enquiries/queries";
import { zonedToIso } from "@/features/enquiries/schemas";
import { addMonths, formatMonthParam, monthRange, parseMonth, todayIn } from "@/features/muhurtham/lib/calendar";
import { loadVendorPage } from "@/features/vendor/lib/page";
import { getResources } from "@/features/vendor/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/calendar">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "calendar" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VendorCalendarPage({ params, searchParams }: PageProps<"/[locale]/vendor/calendar">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/calendar");
  if (!ctx) return null;
  await connection();
  const orgId = ctx.membership.organization_id;
  const [t, tSource, resourcesAll, sp] = await Promise.all([
    getTranslations("calendar"),
    getTranslations("reservationSource"),
    getResources(orgId),
    searchParams,
  ]);
  const resources = resourcesAll.filter((r) => r.active);
  const canEdit = ctx.membership.role !== "staff";

  if (resources.length === 0) {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <EmptyState
          icon={Package}
          title={t("noResources")}
          action={
            canEdit ? (
              <Button asChild>
                <Link href="/vendor/resources">{t("addResources")}</Link>
              </Button>
            ) : null
          }
        />
      </div>
    );
  }

  const today = todayIn("Asia/Kolkata");
  const month = parseMonth(typeof sp.month === "string" ? sp.month : undefined, today);
  const selected = resources.find((r) => r.id === sp.resource) ?? null;
  const ids = selected ? [selected.id] : resources.map((r) => r.id);
  const { from, to } = monthRange(month);
  const nextDay = new Date(`${to}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const entries = await getCalendarReservations(
    orgId,
    ids,
    zonedToIso(from, "00:00"),
    zonedToIso(nextDay.toISOString().slice(0, 10), "00:00"),
  );
  const resourceName = new Map(resources.map((r) => [r.id, r.name]));
  const monthLabel = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(month.year, month.month - 1, 1)));
  const nav = (delta: number) => ({
    pathname: "/vendor/calendar",
    query: { month: formatMonthParam(addMonths(month, delta)), ...(selected ? { resource: selected.id } : {}) },
  });

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0">
          <CardHeader className="gap-3">
            <div className="flex items-center justify-between gap-2">
              <Button asChild variant="ghost" size="icon" aria-label={t("previous")}>
                <Link href={nav(-1)}>
                  <ChevronLeft aria-hidden />
                </Link>
              </Button>
              <CardTitle aria-live="polite">{monthLabel}</CardTitle>
              <Button asChild variant="ghost" size="icon" aria-label={t("next")}>
                <Link href={nav(1)}>
                  <ChevronRight aria-hidden />
                </Link>
              </Button>
            </div>
            <nav aria-label={t("resource")} className="flex flex-wrap gap-1">
              <Button asChild size="sm" variant={selected ? "ghost" : "secondary"}>
                <Link href={{ pathname: "/vendor/calendar", query: { month: formatMonthParam(month) } }}>
                  {resources.length > 1 ? t("allResources") : resources[0].name}
                </Link>
              </Button>
              {resources.length > 1
                ? resources.map((r) => (
                    <Button key={r.id} asChild size="sm" variant={selected?.id === r.id ? "secondary" : "ghost"}>
                      <Link
                        href={{
                          pathname: "/vendor/calendar",
                          query: { month: formatMonthParam(month), resource: r.id },
                        }}
                      >
                        {r.name}
                      </Link>
                    </Button>
                  ))
                : null}
            </nav>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <EmptyState icon={CalendarDays} title={t("empty")} />
            ) : (
              <ul className="grid gap-2" data-testid="calendar-entries">
                {entries.map((r) => {
                  const range = rangeOf(r.period);
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                    >
                      <div className="grid gap-0.5">
                        <span className="font-medium">
                          {range
                            ? `${formatDateTime(range.start, locale, undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} – ${formatDateTime(range.end, locale, undefined, { timeStyle: "short" })}`
                            : "—"}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {resourceName.get(r.resource_id)} · {r.enquiryId ? t("enquiryHold") : tSource(r.source)}
                          {r.notes && !r.enquiryId ? ` · ${r.notes}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        {r.enquiryId ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/vendor/enquiries/${r.enquiryId}`}>{t("viewEnquiry")}</Link>
                          </Button>
                        ) : canEdit ? (
                          <ActionButton
                            action={releaseCalendarEntry.bind(null, r.id)}
                            label={t("release")}
                            successMessage={t("released")}
                            confirm={{ title: t("releaseTitle"), description: t("releaseBody"), destructive: true }}
                          />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        {canEdit ? (
          <Card className="content-start">
            <CardHeader>
              <CardTitle>{t("addTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CalendarEntryForm
                resources={resources.map((r) => ({ id: r.id, label: r.name }))}
                defaultResourceId={selected?.id ?? resources[0].id}
                today={today}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
