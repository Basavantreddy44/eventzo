import type { Metadata, Viewport } from "next";
import { getTranslations } from "next-intl/server";
import { BriefcaseBusiness, MapPin, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { localeFrom } from "@/i18n/params";
import { MyJobActions, OfflineBanner, RegisterServiceWorker } from "@/features/staff/components/my-job-actions";
import { availableJobActions, groupByDate, isToday, telHref } from "@/features/staff/lib/jobs";
import { getMyJobs } from "@/features/staff/queries";
import { loadVendorPage } from "@/features/vendor/lib/page";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/jobs">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "jobs" });
  return {
    title: t("title"),
    robots: { index: false },
    manifest: "/staff.webmanifest",
    appleWebApp: { capable: true, title: t("appName"), statusBarStyle: "default" },
    icons: { apple: "/icons/staff-180.png" },
  };
}

export const viewport: Viewport = { themeColor: "#7B1E3A" };

type Job = Awaited<ReturnType<typeof getMyJobs>>[number];

export default async function MyJobsPage({ params }: PageProps<"/[locale]/vendor/jobs">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/jobs");
  if (!ctx) return null;
  const [t, jobs] = await Promise.all([getTranslations("jobs"), getMyJobs()]);
  const now = new Date();
  const renderedAt = now.toISOString();
  const timeLabel = formatDateTime(now, locale, undefined, { timeStyle: "short" });

  const today = jobs.filter((j) => isToday(j.starts_at, j.ends_at, now));
  const upcoming = jobs.filter((j) => new Date(j.starts_at) > now && !today.includes(j));
  const recent = jobs.filter((j) => !today.includes(j) && !upcoming.includes(j)).reverse();

  const card = (j: Job) => (
    <Card
      key={j.assignment_id}
      data-testid="my-job"
      className={j.job_cancelled || j.status === "cancelled" ? "opacity-70" : ""}
    >
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base">{j.title}</CardTitle>
          <StatusBadge status={j.job_cancelled ? "cancelled" : j.status === "assigned" ? "awaiting_reply" : j.status} />
        </div>
        <p className="text-sm">
          {formatDateTime(j.starts_at, locale, undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
          {" – "}
          {formatDateTime(j.ends_at, locale, undefined, { timeStyle: "short" })}
        </p>
        <p className="text-muted-foreground text-xs">
          {[j.organization_name, j.role_label].filter(Boolean).join(" · ")}
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {j.call_time ? (
          <p className="font-medium">{t("reportAt", { time: formatDateTime(j.call_time, locale) })}</p>
        ) : null}
        {j.site ? (
          <p className="flex items-start gap-2">
            <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {j.site}{" "}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.site)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-xs underline-offset-4 hover:underline"
              >
                {t("openMap")}
              </a>
            </span>
          </p>
        ) : null}
        {j.customer_name ? (
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t("customer")}:</span> {j.customer_name}
            {j.customer_phone ? (
              <a
                href={telHref(j.customer_phone)}
                className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
                data-testid="customer-phone"
              >
                <Phone className="size-4" aria-hidden />
                {j.customer_phone}
              </a>
            ) : (
              <span className="text-muted-foreground text-xs">{t("phoneLater")}</span>
            )}
          </p>
        ) : null}
        {j.guests ? (
          <p>
            <span className="text-muted-foreground">{t("guests")}:</span> {j.guests}
          </p>
        ) : null}
        {j.instructions ? <p className="bg-muted/60 rounded-md p-3 whitespace-pre-line">{j.instructions}</p> : null}
        {j.pay_paise !== null ? (
          <p className="text-muted-foreground text-xs">{t("yourPay", { amount: formatPaise(j.pay_paise) })}</p>
        ) : null}
        {j.staff_note ? <p className="text-xs italic">{t("yourNote", { note: j.staff_note })}</p> : null}
        {j.job_cancelled || j.status === "cancelled" ? (
          <p className="text-destructive text-xs font-medium">{t("cancelledNotice")}</p>
        ) : (
          <MyJobActions
            assignmentId={j.assignment_id}
            actions={availableJobActions({ status: j.status, startsAt: j.starts_at, cancelled: j.job_cancelled }, now)}
          />
        )}
      </CardContent>
    </Card>
  );

  const section = (title: string, rows: Job[], id: string) =>
    rows.length ? (
      <section className="grid gap-3" aria-labelledby={id}>
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {groupByDate(rows, (j) => j.starts_at).map((g) => (
          <div key={g.date} className="grid gap-3">
            {g.rows.map(card)}
          </div>
        ))}
      </section>
    ) : null;

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <RegisterServiceWorker />
      <PageHeader title={t("title")} description={t("subtitle")} />
      <OfflineBanner renderedAt={renderedAt} timeLabel={timeLabel} />
      {jobs.length === 0 ? (
        <EmptyState icon={BriefcaseBusiness} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <>
          {section(t("today"), today, "jobs-today")}
          {section(t("upcoming"), upcoming, "jobs-upcoming")}
          {section(t("recent"), recent, "jobs-recent")}
        </>
      )}
      <p className="text-muted-foreground text-xs">{t("installHint")}</p>
    </div>
  );
}
