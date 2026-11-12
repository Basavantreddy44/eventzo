import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Receipt, Wallet } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { localeFrom } from "@/i18n/params";
import { todayIn } from "@/features/muhurtham/lib/calendar";
import { deleteExpense } from "@/features/finance/actions";
import { CsvButton, ExpenseForm } from "@/features/finance/components/finance-forms";
import { RangePicker } from "@/features/finance/components/range-picker";
import { monthLabel, netCash, paiseToPlain, resolveRange } from "@/features/finance/lib/finance";
import { getVendorReport, listExpenses, listReceivables, listReceivedPayments } from "@/features/finance/queries";
import { loadVendorPage } from "@/features/vendor/lib/page";

export const instant = false;

const TABS = ["overview", "expenses", "payments"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/finance">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "finance" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VendorFinancePage({ params, searchParams }: PageProps<"/[locale]/vendor/finance">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/finance");
  if (!ctx) return null;
  const t = await getTranslations("finance");
  if (ctx.membership.role === "staff") {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <EmptyState icon={Wallet} title={t("managersOnly")} />
      </div>
    );
  }
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : "overview";
  const today = todayIn("Asia/Kolkata");
  const range = resolveRange(sp, today);
  const orgId = ctx.membership.organization_id;
  const branchId = ctx.activeBranchId;
  const money = (p: number) => formatPaise(p);
  const keep: Record<string, string> = tab === "overview" ? {} : { tab };
  const rangeQuery = range.preset === "custom" ? { from: range.from, to: range.to } : { range: range.preset };

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <p className="text-muted-foreground -mt-3 text-xs">{t("notTaxAdvice")}</p>

      <nav aria-label={t("sections")} className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((name) => (
          <Link
            key={name}
            href={{
              pathname: "/vendor/finance",
              query: name === "overview" ? rangeQuery : { ...rangeQuery, tab: name },
            }}
            aria-current={tab === name ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              tab === name
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
            data-testid={`finance-tab-${name}`}
          >
            {t(`tabs.${name}`)}
          </Link>
        ))}
      </nav>

      <RangePicker pathname="/vendor/finance" current={range} extra={keep} />

      {tab === "overview" ? <Overview /> : null}
      {tab === "expenses" ? <Expenses /> : null}
      {tab === "payments" ? <Payments /> : null}
    </div>
  );

  async function Overview() {
    const [report, receivables] = await Promise.all([
      getVendorReport(orgId, range.from, range.to),
      listReceivables(orgId, branchId),
    ]);
    const tot = report.totals;
    const net = netCash(tot);
    const kpis = [
      { key: "received", value: tot.received_paise },
      { key: "refunded", value: tot.refunded_paise },
      { key: "expenses", value: tot.expenses_paise },
      { key: "net", value: net },
      { key: "outstanding", value: tot.outstanding_paise },
    ] as const;
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="finance-kpis">
          {kpis.map((k) => (
            <Card key={k.key} className="gap-1 py-4">
              <CardHeader className="px-4">
                <p className="text-muted-foreground text-xs">{t(`kpi.${k.key}`)}</p>
              </CardHeader>
              <CardContent className="px-4">
                <p
                  className={cn("text-xl font-semibold tabular-nums", k.key === "net" && net < 0 && "text-destructive")}
                  data-testid={`kpi-${k.key}`}
                >
                  {money(k.value)}
                </p>
                <p className="text-muted-foreground text-xs">{t(`kpiHint.${k.key}`)}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>{t("byMonth")}</CardTitle>
            <CsvButton
              filename={`eventzo-finance-${range.from}-${range.to}.csv`}
              label={t("downloadCsv")}
              rows={[
                [t("colMonth"), t("kpi.booked"), t("kpi.received"), t("kpi.refunded"), t("kpi.expenses"), t("kpi.net")],
                ...report.monthly.map((m) => [
                  m.month,
                  paiseToPlain(m.booked_value_paise),
                  paiseToPlain(m.received_paise),
                  paiseToPlain(m.refunded_paise),
                  paiseToPlain(m.expenses_paise),
                  paiseToPlain(netCash(m)),
                ]),
              ]}
            />
          </CardHeader>
          <CardContent>
            <DataTable
              rows={report.monthly}
              rowKey={(m) => m.month}
              caption={t("byMonth")}
              empty={<EmptyState icon={Wallet} title={t("noData")} />}
              columns={[
                { key: "m", header: t("colMonth"), cell: (m) => monthLabel(m.month, locale) },
                {
                  key: "b",
                  header: t("kpi.booked"),
                  cell: (m) => money(m.booked_value_paise),
                  className: "text-right tabular-nums",
                  hideOnMobile: true,
                },
                {
                  key: "r",
                  header: t("kpi.received"),
                  cell: (m) => money(m.received_paise),
                  className: "text-right tabular-nums",
                },
                {
                  key: "x",
                  header: t("kpi.expenses"),
                  cell: (m) => money(m.expenses_paise),
                  className: "text-right tabular-nums",
                },
                {
                  key: "n",
                  header: t("kpi.net"),
                  cell: (m) => {
                    const n = netCash(m);
                    return <span className={cn(n < 0 && "text-destructive")}>{money(n)}</span>;
                  },
                  className: "text-right tabular-nums",
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("receivables")}</CardTitle>
            <p className="text-muted-foreground text-sm">{t("receivablesHint")}</p>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={receivables}
              rowKey={(r) => r.id}
              caption={t("receivables")}
              empty={<EmptyState icon={Wallet} title={t("noReceivables")} />}
              columns={[
                {
                  key: "t",
                  header: t("colBooking"),
                  cell: (r) => (
                    <Link href={`/vendor/bookings/${r.id}`} className="text-primary underline-offset-4 hover:underline">
                      {r.title}
                    </Link>
                  ),
                },
                {
                  key: "d",
                  header: t("colEventDate"),
                  cell: (r) =>
                    formatDateTime(`${r.eventDate}T12:00:00+05:30`, locale, undefined, { dateStyle: "medium" }),
                },
                {
                  key: "tot",
                  header: t("colTotal"),
                  cell: (r) => money(r.total),
                  className: "text-right tabular-nums",
                  hideOnMobile: true,
                },
                {
                  key: "p",
                  header: t("colPaid"),
                  cell: (r) => money(r.paid),
                  className: "text-right tabular-nums",
                  hideOnMobile: true,
                },
                {
                  key: "due",
                  header: t("colDue"),
                  cell: (r) => <strong>{money(r.due)}</strong>,
                  className: "text-right tabular-nums",
                },
              ]}
            />
          </CardContent>
        </Card>
      </>
    );
  }

  async function Expenses() {
    const rows = await listExpenses(orgId, branchId, range.from, range.to);
    const total = rows.reduce((s, r) => s + r.amount_paise, 0);
    const tModes = await getTranslations("bookings.modes");
    type Row = (typeof rows)[number];
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{t("expenses")}</CardTitle>
              <p className="text-muted-foreground text-sm" data-testid="expenses-total">
                {t("expensesTotal", { amount: money(total), count: rows.length })}
              </p>
            </div>
            <CsvButton
              filename={`eventzo-expenses-${range.from}-${range.to}.csv`}
              label={t("downloadCsv")}
              rows={[
                [t("spentOn"), t("category"), t("amount"), t("payee"), t("mode"), t("reference"), t("note")],
                ...rows.map((r) => [
                  r.spent_on,
                  t(`categories.${r.category}`),
                  paiseToPlain(r.amount_paise),
                  r.payee,
                  r.mode ? tModes(r.mode) : "",
                  r.reference,
                  r.note,
                ]),
              ]}
            />
          </CardHeader>
          <CardContent>
            <DataTable<Row>
              rows={rows}
              rowKey={(r) => r.id}
              caption={t("expenses")}
              empty={<EmptyState icon={Wallet} title={t("noExpenses")} />}
              columns={[
                {
                  key: "d",
                  header: t("spentOn"),
                  cell: (r) =>
                    formatDateTime(`${r.spent_on}T12:00:00+05:30`, locale, undefined, { dateStyle: "medium" }),
                },
                {
                  key: "c",
                  header: t("category"),
                  cell: (r) => (
                    <div className="grid gap-0.5">
                      <span>{t(`categories.${r.category}`)}</span>
                      {r.payee || r.note ? (
                        <span className="text-muted-foreground text-xs">
                          {[r.payee, r.note].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </div>
                  ),
                },
                {
                  key: "a",
                  header: t("amount"),
                  cell: (r) => money(r.amount_paise),
                  className: "text-right tabular-nums",
                },
                {
                  key: "m",
                  header: t("mode"),
                  cell: (r) => (r.mode ? tModes(r.mode) : "—"),
                  hideOnMobile: true,
                },
                {
                  key: "x",
                  header: "",
                  className: "text-right",
                  cell: (r) => (
                    <ActionButton
                      action={deleteExpense.bind(null, r.id)}
                      label={t("delete")}
                      successMessage={t("expenseDeleted")}
                      confirm={{ title: t("deleteTitle"), description: t("deleteBody"), destructive: true }}
                    />
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
        <Card className="content-start">
          <CardHeader>
            <CardTitle>{t("addExpense")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseForm
              today={today}
              branches={ctx!.branches.map((b) => ({ id: b.id, label: b.name }))}
              allowBusinessWide={ctx!.membership.role === "owner"}
              defaultBranchId={
                ctx!.membership.role === "owner" ? (branchId ?? "") : (branchId ?? ctx!.branches[0]?.id ?? "")
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  async function Payments() {
    const rows = await listReceivedPayments(orgId, branchId, range.from, range.to);
    const tModes = await getTranslations("bookings.modes");
    const tB = await getTranslations("bookings");
    const total = rows.reduce((s, r) => s + r.amount_paise, 0);
    const methodOf = (r: (typeof rows)[number]) => (r.offline_mode ? tModes(r.offline_mode) : tB("methodOnline"));
    type Row = (typeof rows)[number];
    return (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{t("paymentsReceived")}</CardTitle>
            <p className="text-muted-foreground text-sm">
              {t("paymentsTotal", { amount: money(total), count: rows.length })}
            </p>
          </div>
          <CsvButton
            filename={`eventzo-payments-${range.from}-${range.to}.csv`}
            label={t("downloadCsv")}
            rows={[
              [t("colReceipt"), t("colPaidAt"), t("colBooking"), t("colKind"), t("mode"), t("amount")],
              ...rows.map((r) => [
                r.receipt_number,
                r.paid_at,
                r.title,
                tB(`kinds.${r.kind as "advance"}`),
                methodOf(r),
                paiseToPlain(r.amount_paise),
              ]),
            ]}
          />
        </CardHeader>
        <CardContent>
          <DataTable<Row>
            rows={rows}
            rowKey={(r) => r.id}
            caption={t("paymentsReceived")}
            empty={<EmptyState icon={Receipt} title={t("noPayments")} />}
            columns={[
              {
                key: "n",
                header: t("colReceipt"),
                cell: (r) => (
                  <Link
                    href={`/receipts/${r.id}`}
                    className="text-primary font-mono text-xs underline-offset-4 hover:underline"
                  >
                    {r.receipt_number ?? "—"}
                  </Link>
                ),
              },
              { key: "d", header: t("colPaidAt"), cell: (r) => (r.paid_at ? formatDateTime(r.paid_at, locale) : "—") },
              {
                key: "b",
                header: t("colBooking"),
                cell: (r) => (
                  <Link href={`/vendor/bookings/${r.bookingItemId}`} className="underline-offset-4 hover:underline">
                    {r.title}
                  </Link>
                ),
                hideOnMobile: true,
              },
              {
                key: "m",
                header: t("mode"),
                cell: (r) => `${tB(`kinds.${r.kind as "advance"}`)} · ${methodOf(r)}`,
                hideOnMobile: true,
              },
              {
                key: "a",
                header: t("amount"),
                cell: (r) => money(r.amount_paise),
                className: "text-right tabular-nums",
              },
            ]}
          />
        </CardContent>
      </Card>
    );
  }
}
