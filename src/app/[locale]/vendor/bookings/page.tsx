import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClipboardList } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { localeFrom } from "@/i18n/params";
import { amountsDue } from "@/features/bookings/lib/money";
import { bookingSnapshotOf, listOrgBookings } from "@/features/bookings/queries";
import { loadVendorPage } from "@/features/vendor/lib/page";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/bookings">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendorBookings" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VendorBookingsPage({ params, searchParams }: PageProps<"/[locale]/vendor/bookings">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/bookings");
  if (!ctx) return null;
  const [t, tVendor, sp] = await Promise.all([
    getTranslations("vendorBookings"),
    getTranslations("vendor"),
    searchParams,
  ]);
  if (ctx.membership.role === "staff") return <p className="text-muted-foreground text-sm">{tVendor("ownerOnly")}</p>;

  const all = sp.filter === "all";
  const rows = await listOrgBookings(ctx.membership.organization_id, !all);
  type Row = (typeof rows)[number];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className="flex gap-1">
            <Button asChild size="sm" variant={all ? "ghost" : "secondary"}>
              <Link href="/vendor/bookings">{t("filterUpcoming")}</Link>
            </Button>
            <Button asChild size="sm" variant={all ? "secondary" : "ghost"}>
              <Link href={{ pathname: "/vendor/bookings", query: { filter: "all" } }}>{t("filterAll")}</Link>
            </Button>
          </div>
        }
      />
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        caption={t("title")}
        empty={<EmptyState icon={ClipboardList} title={t("empty")} description={t("emptyBody")} />}
        columns={[
          {
            key: "listing",
            header: t("colListing"),
            cell: (r) => <span className="font-medium">{bookingSnapshotOf(r.snapshot).listing?.title ?? "—"}</span>,
          },
          {
            key: "date",
            header: t("colDate"),
            cell: (r) => formatDateTime(`${r.event_date}T00:00:00Z`, locale, "UTC", { dateStyle: "medium" }),
          },
          { key: "status", header: t("colStatus"), cell: (r) => <StatusBadge status={r.status} /> },
          {
            key: "balance",
            header: t("colBalance"),
            cell: (r) => formatPaise(amountsDue(r).balance, { currency: r.currency }),
            hideOnMobile: true,
          },
          {
            key: "open",
            header: "",
            className: "text-right",
            cell: (r) => (
              <Button asChild size="sm">
                <Link href={`/vendor/bookings/${r.id}`}>{t("open")}</Link>
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
