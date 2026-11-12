import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CalendarClock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { localeFrom } from "@/i18n/params";
import { todayIn } from "@/features/muhurtham/lib/calendar";
import { JobTeam } from "@/features/staff/components/job-team";
import { groupByDate } from "@/features/staff/lib/jobs";
import { listAssignableStaff, listSchedule } from "@/features/staff/queries";
import { loadVendorPage } from "@/features/vendor/lib/page";

export const instant = false;

const WINDOWS = [7, 14, 30, 90, 365] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/schedule">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "schedule" });
  return { title: t("title"), robots: { index: false } };
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function VendorSchedulePage({ params, searchParams }: PageProps<"/[locale]/vendor/schedule">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/schedule");
  if (!ctx) return null;
  const t = await getTranslations("schedule");
  if (ctx.membership.role === "staff") {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <EmptyState
          icon={CalendarClock}
          title={t("managersOnly")}
          action={
            <Button asChild variant="outline">
              <Link href="/vendor/jobs">{t("toMyJobs")}</Link>
            </Button>
          }
        />
      </div>
    );
  }
  const sp = await searchParams;
  const days = WINDOWS.find((w) => String(w) === sp.days) ?? 14;
  const orgId = ctx.membership.organization_id;
  const today = todayIn("Asia/Kolkata");
  // From midnight IST today, so jobs running now are still listed.
  const from = new Date(`${today}T00:00:00+05:30`).toISOString();
  const to = new Date(`${addDays(today, days)}T00:00:00+05:30`).toISOString();
  const [jobs, staff] = await Promise.all([
    listSchedule(orgId, ctx.activeBranchId, from, to),
    listAssignableStaff(orgId, ctx.activeBranchId),
  ]);
  const branchName = new Map(ctx.branches.map((b) => [b.id, b.name]));
  const unstaffed = jobs.filter((j) => j.assignments.every((a) => a.status === "declined")).length;

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("window")} className="flex flex-wrap gap-1">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={{ pathname: "/vendor/schedule", query: { days: String(w) } }}
              aria-current={days === w ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                days === w ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
              )}
            >
              {t("nextDays", { count: w })}
            </Link>
          ))}
        </nav>
        <p className="text-muted-foreground text-sm" data-testid="schedule-summary">
          {t("summary", { jobs: jobs.length, unstaffed })}
        </p>
      </div>

      {staff.length === 0 ? (
        <p className="text-sm">
          {t("noStaff")}{" "}
          <Link href="/vendor/staff" className="text-primary underline-offset-4 hover:underline">
            {t("addStaff")}
          </Link>
        </p>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t("empty")} description={t("emptyHint")} />
      ) : (
        groupByDate(jobs, (j) => j.startsAt).map((group) => (
          <section key={group.date} className="grid gap-3" aria-labelledby={`d-${group.date}`}>
            <h2 id={`d-${group.date}`} className="text-sm font-semibold">
              {formatDateTime(`${group.date}T12:00:00+05:30`, locale, undefined, { dateStyle: "full" })}
            </h2>
            {group.rows.map((j) => {
              const live = j.assignments.filter((a) => a.status !== "declined");
              return (
                <Card key={j.key} data-testid="schedule-job">
                  <CardHeader className="gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">{j.title}</CardTitle>
                      <Badge variant={j.kind === "booking" ? "info" : "muted"}>
                        {j.kind === "booking" ? t("kindBooking") : t("kindOffline")}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {formatDateTime(j.startsAt, locale, undefined, { timeStyle: "short" })} –{" "}
                      {formatDateTime(j.endsAt, locale, undefined, { timeStyle: "short" })}
                      {j.guests ? ` · ${t("guests", { count: j.guests })}` : ""}
                      {j.branchId && ctx.branches.length > 1 ? ` · ${branchName.get(j.branchId) ?? ""}` : ""}
                    </p>
                    {j.bookingItemId ? (
                      <Link
                        href={`/vendor/bookings/${j.bookingItemId}`}
                        className="text-primary w-fit text-xs underline-offset-4 hover:underline"
                      >
                        {t("openBooking")}
                      </Link>
                    ) : j.notes ? (
                      <p className="text-muted-foreground text-xs">{j.notes}</p>
                    ) : null}
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <div className="flex flex-wrap gap-2" aria-label={t("team")}>
                      {live.length === 0 ? (
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{t("unstaffed")}</span>
                      ) : (
                        live.map((a) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                          >
                            {a.staffName}
                            <StatusBadge
                              status={a.status === "assigned" ? "awaiting_reply" : a.status}
                              className="h-4 px-1 text-[10px]"
                            />
                          </span>
                        ))
                      )}
                    </div>
                    <details>
                      <summary className="text-primary cursor-pointer text-sm" data-testid="manage-staff">
                        {t("manage")}
                      </summary>
                      <div className="pt-3">
                        <JobTeam
                          job={j.job}
                          bookingItemId={j.bookingItemId ?? undefined}
                          reservationId={j.reservationId ?? undefined}
                          startsAt={j.startsAt}
                          endsAt={j.endsAt}
                          assignments={j.assignments}
                          staffOptions={staff}
                          locale={locale}
                          today={today}
                          idPrefix={j.key.slice(0, 10)}
                        />
                      </div>
                    </details>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
