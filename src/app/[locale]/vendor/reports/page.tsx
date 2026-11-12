import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChartColumn } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { formatPaise } from "@/lib/money";
import { localeFrom } from "@/i18n/params";
import { todayIn } from "@/features/muhurtham/lib/calendar";
import { CsvButton } from "@/features/finance/components/finance-forms";
import { RangePicker } from "@/features/finance/components/range-picker";
import { paiseToPlain, percent, resolveRange } from "@/features/finance/lib/finance";
import { getVendorReport } from "@/features/finance/queries";
import { loadVendorPage } from "@/features/vendor/lib/page";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/reports">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "reports" });
  return { title: t("title"), robots: { index: false } };
}

/** A thin bar for a 0–100 share (purely visual; the number is always shown next to it). */
function Bar({ value }: { value: number | null }) {
  return (
    <span className="bg-muted inline-block h-1.5 w-20 overflow-hidden rounded-full align-middle" aria-hidden>
      <span className="bg-primary block h-full" style={{ width: `${Math.min(100, value ?? 0)}%` }} />
    </span>
  );
}

export default async function VendorReportsPage({ params, searchParams }: PageProps<"/[locale]/vendor/reports">) {
  const { ctx } = await loadVendorPage(params, "/vendor/reports");
  if (!ctx) return null;
  const t = await getTranslations("reports");
  if (ctx.membership.role === "staff") {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <EmptyState icon={ChartColumn} title={t("managersOnly")} />
      </div>
    );
  }
  const [sp, tRes, tFin] = await Promise.all([
    searchParams,
    getTranslations("vendor.resources"),
    getTranslations("finance"),
  ]);
  const range = resolveRange(sp, todayIn("Asia/Kolkata"), "this_fy");
  const report = await getVendorReport(ctx.membership.organization_id, range.from, range.to);
  const tot = report.totals;
  const money = (p: number) => formatPaise(p);
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  const suffix = `${range.from}-${range.to}`;

  const funnel = [
    { key: "enquiries", value: String(tot.enquiries) },
    { key: "quoted", value: String(tot.quoted), hint: pct(percent(tot.quoted, tot.enquiries)) },
    { key: "bookings", value: String(tot.bookings), hint: pct(percent(tot.bookings, tot.enquiries)) },
    { key: "bookedValue", value: money(tot.booked_value_paise), hint: t("jobsCount", { count: tot.confirmed_jobs }) },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <RangePicker pathname="/vendor/reports" current={range} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="report-funnel">
        {funnel.map((k) => (
          <Card key={k.key} className="gap-1 py-4">
            <CardHeader className="px-4">
              <p className="text-muted-foreground text-xs">{t(`funnel.${k.key as "enquiries"}`)}</p>
            </CardHeader>
            <CardContent className="px-4">
              <p className="text-xl font-semibold tabular-nums" data-testid={`report-${k.key}`}>
                {k.value}
              </p>
              {k.hint ? <p className="text-muted-foreground text-xs">{k.hint}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground -mt-3 text-xs">{t("funnelHint")}</p>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("byListing")}</CardTitle>
          <CsvButton
            filename={`eventzo-listings-${suffix}.csv`}
            label={tFin("downloadCsv")}
            rows={[
              [t("colListing"), t("funnel.enquiries"), t("colConfirmed"), t("funnel.bookedValue")],
              ...report.listings.map((l) => [l.title, l.enquiries, l.confirmed, paiseToPlain(l.booked_value_paise)]),
            ]}
          />
        </CardHeader>
        <CardContent>
          <DataTable
            rows={report.listings}
            rowKey={(l) => l.service_id}
            caption={t("byListing")}
            empty={<EmptyState icon={ChartColumn} title={t("noData")} />}
            columns={[
              { key: "t", header: t("colListing"), cell: (l) => l.title },
              {
                key: "e",
                header: t("funnel.enquiries"),
                cell: (l) => l.enquiries,
                className: "text-right tabular-nums",
              },
              { key: "c", header: t("colConfirmed"), cell: (l) => l.confirmed, className: "text-right tabular-nums" },
              {
                key: "v",
                header: t("funnel.bookedValue"),
                cell: (l) => money(l.booked_value_paise),
                className: "text-right tabular-nums",
                hideOnMobile: true,
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{t("utilisation")}</CardTitle>
            <p className="text-muted-foreground text-sm">{t("utilisationHint", { days: report.days })}</p>
          </div>
          <CsvButton
            filename={`eventzo-utilisation-${suffix}.csv`}
            label={tFin("downloadCsv")}
            rows={[
              [t("colResource"), t("colKind"), t("colBookedDays"), t("colBlockedDays"), t("colUse")],
              ...report.resources.map((r) => [
                r.name,
                tRes(`kinds.${r.kind as "artist"}`),
                r.booked_days,
                r.blocked_days,
                percent(r.booked_days, report.days),
              ]),
            ]}
          />
        </CardHeader>
        <CardContent>
          <DataTable
            rows={report.resources}
            rowKey={(r) => r.resource_id}
            caption={t("utilisation")}
            empty={<EmptyState icon={ChartColumn} title={t("noResources")} />}
            columns={[
              { key: "n", header: t("colResource"), cell: (r) => r.name },
              { key: "k", header: t("colKind"), cell: (r) => tRes(`kinds.${r.kind as "artist"}`), hideOnMobile: true },
              {
                key: "b",
                header: t("colBookedDays"),
                cell: (r) => r.booked_days,
                className: "text-right tabular-nums",
              },
              {
                key: "x",
                header: t("colBlockedDays"),
                cell: (r) => r.blocked_days,
                className: "text-right tabular-nums",
                hideOnMobile: true,
              },
              {
                key: "u",
                header: t("colUse"),
                cell: (r) => {
                  const p = percent(r.booked_days, report.days);
                  return (
                    <span className="inline-flex items-center gap-2">
                      <Bar value={p} />
                      <span className="tabular-nums">{pct(p)}</span>
                    </span>
                  );
                },
                className: "text-right",
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("staff")}</CardTitle>
          <CsvButton
            filename={`eventzo-staff-${suffix}.csv`}
            label={tFin("downloadCsv")}
            rows={[
              [t("colStaff"), t("colJobs"), t("colCompleted"), t("colDeclined"), t("colAgreedPay"), t("colPaidOut")],
              ...report.staff.map((s) => [
                s.name,
                s.jobs,
                s.completed,
                s.declined,
                paiseToPlain(s.pay_paise),
                paiseToPlain(s.paid_out_paise),
              ]),
            ]}
          />
        </CardHeader>
        <CardContent>
          <DataTable
            rows={report.staff}
            rowKey={(s) => s.staff_profile_id}
            caption={t("staff")}
            empty={<EmptyState icon={ChartColumn} title={t("noStaff")} />}
            columns={[
              {
                key: "n",
                header: t("colStaff"),
                cell: (s) => (
                  <div className="grid gap-0.5">
                    <span>{s.name}</span>
                    {s.skill ? <span className="text-muted-foreground text-xs">{s.skill}</span> : null}
                  </div>
                ),
              },
              { key: "j", header: t("colJobs"), cell: (s) => s.jobs, className: "text-right tabular-nums" },
              {
                key: "c",
                header: t("colCompleted"),
                cell: (s) => s.completed,
                className: "text-right tabular-nums",
                hideOnMobile: true,
              },
              {
                key: "d",
                header: t("colDeclined"),
                cell: (s) => s.declined,
                className: "text-right tabular-nums",
                hideOnMobile: true,
              },
              {
                key: "p",
                header: t("colAgreedPay"),
                cell: (s) => money(s.pay_paise),
                className: "text-right tabular-nums",
              },
              {
                key: "o",
                header: t("colPaidOut"),
                cell: (s) => money(s.paid_out_paise),
                className: "text-right tabular-nums",
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("expensesByCategory")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={report.expenses_by_category}
            rowKey={(e) => e.category}
            caption={t("expensesByCategory")}
            empty={<EmptyState icon={ChartColumn} title={tFin("noExpenses")} />}
            columns={[
              { key: "c", header: tFin("category"), cell: (e) => tFin(`categories.${e.category as "other"}`) },
              {
                key: "a",
                header: tFin("amount"),
                cell: (e) => money(e.amount_paise),
                className: "text-right tabular-nums",
              },
              {
                key: "s",
                header: t("colShare"),
                cell: (e) => pct(percent(e.amount_paise, tot.expenses_paise)),
                className: "text-right tabular-nums",
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
