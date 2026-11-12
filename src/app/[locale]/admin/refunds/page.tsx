import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Undo2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { issueOnlineRefund } from "@/features/bookings/actions/admin";
import { ManualRefund } from "@/features/bookings/components/manual-refund";
import { listRefunds } from "@/features/bookings/queries";
import { getPaymentMode, getRazorpayConfig, isTestMode } from "@/features/payments/lib/razorpay";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/refunds">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "refunds" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AdminRefundsPage({ params, searchParams }: PageProps<"/[locale]/admin/refunds">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/admin/refunds"));
  const [t, tAdmin, sp] = await Promise.all([
    getTranslations("refunds"),
    getTranslations("admin.dashboard"),
    searchParams,
  ]);

  if (!hasPermission(user.access, "finance.read")) {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("title")} />
        <Card>
          <CardContent>{tAdmin("noPermission")}</CardContent>
        </Card>
      </div>
    );
  }

  const canManage = hasPermission(user.access, "finance.manage");
  const config = getRazorpayConfig();
  const mode = getPaymentMode();
  const all = sp.filter === "all";
  const rows = await listRefunds(!all);
  type Row = (typeof rows)[number];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className="flex gap-1">
            <Button asChild size="sm" variant={all ? "ghost" : "secondary"}>
              <Link href="/admin/refunds">{t("filterOpen")}</Link>
            </Button>
            <Button asChild size="sm" variant={all ? "secondary" : "ghost"}>
              <Link href={{ pathname: "/admin/refunds", query: { filter: "all" } }}>{t("filterAll")}</Link>
            </Button>
          </div>
        }
      />
      <p className="text-muted-foreground text-sm">
        {config
          ? isTestMode(config)
            ? t("gatewayTest")
            : t("gatewayLive")
          : mode === "simulator"
            ? t("gatewaySimulator")
            : t("gatewayMissing")}
      </p>
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        caption={t("title")}
        empty={<EmptyState icon={Undo2} title={t("empty")} description={t("emptyBody")} />}
        columns={[
          {
            key: "vendor",
            header: t("colVendor"),
            cell: (r) => (
              <div className="grid gap-0.5">
                <span className="font-medium">{r.organizations?.name ?? "—"}</span>
                <span className="text-muted-foreground text-xs">{r.reason}</span>
              </div>
            ),
          },
          {
            key: "amount",
            header: t("colAmount"),
            cell: (r) => (
              <div className="grid gap-0.5">
                <span>{formatPaise(r.amount_paise, { currency: r.currency })}</span>
                <span className="text-muted-foreground text-xs">
                  {r.method === "offline" ? t("methodOffline") : t("methodOnline")}
                </span>
              </div>
            ),
          },
          {
            key: "status",
            header: t("colStatus"),
            cell: (r) => <StatusBadge status={`refund_${r.status}`} />,
          },
          {
            key: "created",
            header: t("colCreated"),
            cell: (r) => formatDateTime(r.created_at, locale),
            hideOnMobile: true,
          },
          {
            key: "action",
            header: "",
            className: "text-right",
            cell: (r) => {
              if (!canManage || (r.status !== "pending" && r.status !== "failed")) return r.reference ?? null;
              if (r.method === "offline") return <ManualRefund refundId={r.id} />;
              return mode ? (
                <ActionButton
                  action={issueOnlineRefund.bind(null, r.id)}
                  label={t("issue")}
                  successMessage={t("issued")}
                  variant="default"
                  confirm={{
                    title: t("issueTitle"),
                    description: t("issueBody", { amount: formatPaise(r.amount_paise, { currency: r.currency }) }),
                  }}
                />
              ) : (
                <Button size="sm" disabled title={t("gatewayMissing")}>
                  {t("issue")}
                </Button>
              );
            },
          },
        ]}
      />
    </div>
  );
}
