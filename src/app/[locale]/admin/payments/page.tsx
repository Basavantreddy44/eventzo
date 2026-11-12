import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Receipt } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { localeFrom } from "@/i18n/params";
import { CsvButton } from "@/features/finance/components/finance-forms";
import { paiseToPlain } from "@/features/finance/lib/finance";
import { NoPermission } from "@/features/admin/components/no-permission";
import { Pager } from "@/features/admin/components/pager";
import { loadAdminPage } from "@/features/admin/lib/page";
import { ledgerTotals, listLedger, listVendorOptions } from "@/features/admin/queries";
import { LEDGER_METHODS, LEDGER_STATUSES, parseLedgerFilters } from "@/features/admin/schemas";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/payments">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "admin.payments" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AdminPaymentsPage({ params, searchParams }: PageProps<"/[locale]/admin/payments">) {
  const { locale, allowed } = await loadAdminPage(params, "/admin/payments", "finance.read");
  const [t, tB, tModes] = await Promise.all([
    getTranslations("admin.payments"),
    getTranslations("bookings"),
    getTranslations("bookings.modes"),
  ]);
  if (!allowed) return <NoPermission title={t("title")} />;

  const f = parseLedgerFilters(await searchParams);
  const [{ rows, total }, totals, vendors] = await Promise.all([listLedger(f), ledgerTotals(f), listVendorOptions()]);
  const query: Record<string, string> = Object.fromEntries(
    Object.entries({ status: f.status, method: f.method, vendor: f.vendor, from: f.from, to: f.to }).filter(
      (e): e is [string, string] => !!e[1],
    ),
  );
  const methodOf = (r: (typeof rows)[number]) =>
    r.method === "offline"
      ? r.offline_mode
        ? tModes(r.offline_mode)
        : t("offline")
      : r.razorpay_payment_id?.startsWith("pay_sim_")
        ? tB("methodSimulated")
        : tB("methodOnline");
  type Row = (typeof rows)[number];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <p className="text-muted-foreground -mt-3 text-xs">{t("offlineNote")}</p>

      <form method="get" className="flex flex-wrap items-end gap-2" aria-label={t("filter")}>
        <label className="grid gap-1 text-xs">
          {t("status")}
          <NativeSelect name="status" defaultValue={f.status ?? ""} className="h-9 w-auto">
            <option value="">{t("all")}</option>
            {LEDGER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-xs">
          {t("method")}
          <NativeSelect name="method" defaultValue={f.method ?? ""} className="h-9 w-auto">
            <option value="">{t("all")}</option>
            {LEDGER_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`methods.${m}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-xs">
          {t("vendor")}
          <NativeSelect name="vendor" defaultValue={f.vendor ?? ""} className="h-9 w-48">
            <option value="">{t("allVendors")}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-xs">
          {t("from")}
          <Input type="date" name="from" defaultValue={f.from ?? ""} className="h-9" />
        </label>
        <label className="grid gap-1 text-xs">
          {t("to")}
          <Input type="date" name="to" defaultValue={f.to ?? ""} className="h-9" />
        </label>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          {t("apply")}
        </Button>
        {Object.keys(query).length ? (
          <Button asChild variant="ghost" size="sm" className="h-9">
            <Link href="/admin/payments">{t("clear")}</Link>
          </Button>
        ) : null}
      </form>

      <div className="grid gap-3 sm:grid-cols-3" data-testid="ledger-totals">
        {(
          [
            ["online", totals.online],
            ["offline", totals.offline],
            ["refunded", totals.refunded],
          ] as const
        ).map(([k, v]) => (
          <Card key={k} className="gap-1 py-4">
            <CardHeader className="px-4">
              <p className="text-muted-foreground text-xs">{t(`totals.${k}`)}</p>
            </CardHeader>
            <CardContent className="px-4">
              <p className="text-xl font-semibold tabular-nums">{formatPaise(v)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">{t("count", { count: total })}</p>
        <CsvButton
          filename={`eventzo-payments-ledger${f.from ? `-${f.from}` : ""}${f.to ? `-${f.to}` : ""}.csv`}
          label={t("downloadCsv")}
          rows={[
            [
              t("colCreated"),
              t("colPaidAt"),
              t("colVendor"),
              t("colBooking"),
              t("colKind"),
              t("method"),
              t("status"),
              t("colReceipt"),
              t("colAmount"),
            ],
            ...rows.map((r) => [
              r.created_at,
              r.paid_at,
              r.vendor,
              r.listing,
              tB(`kinds.${r.kind as "advance"}`),
              methodOf(r),
              r.status,
              r.receipt_number,
              paiseToPlain(r.amount_paise),
            ]),
          ]}
        />
      </div>

      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        caption={t("title")}
        empty={<EmptyState icon={Receipt} title={t("empty")} />}
        columns={[
          {
            key: "w",
            header: t("colCreated"),
            cell: (r) => (
              <div className="grid gap-0.5">
                <span>{formatDateTime(r.paid_at ?? r.created_at, locale)}</span>
                {r.receipt_number ? (
                  <Link
                    href={`/receipts/${r.id}`}
                    className="text-primary font-mono text-xs underline-offset-4 hover:underline"
                  >
                    {r.receipt_number}
                  </Link>
                ) : null}
              </div>
            ),
          },
          {
            key: "v",
            header: t("colVendor"),
            cell: (r) => (
              <div className="grid gap-0.5">
                <Link href={`/admin/vendors/${r.organization_id}`} className="underline-offset-4 hover:underline">
                  {r.vendor}
                </Link>
                <span className="text-muted-foreground text-xs">{r.listing}</span>
              </div>
            ),
          },
          {
            key: "m",
            header: t("method"),
            cell: (r) => `${tB(`kinds.${r.kind as "advance"}`)} · ${methodOf(r)}`,
            hideOnMobile: true,
          },
          { key: "s", header: t("status"), cell: (r) => <StatusBadge status={r.status} /> },
          {
            key: "a",
            header: t("colAmount"),
            cell: (r) => formatPaise(r.amount_paise),
            className: "text-right tabular-nums",
          },
        ]}
      />
      <Pager pathname="/admin/payments" query={query} page={f.page} total={total} />
    </div>
  );
}
