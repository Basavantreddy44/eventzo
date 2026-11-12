import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Inbox } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { listOrgEnquiries } from "@/features/enquiries/queries";
import { loadVendorPage } from "@/features/vendor/lib/page";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/enquiries">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendorEnquiries" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VendorEnquiriesPage({ params, searchParams }: PageProps<"/[locale]/vendor/enquiries">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/enquiries");
  if (!ctx) return null;
  const [t, tVendor, sp] = await Promise.all([
    getTranslations("vendorEnquiries"),
    getTranslations("vendor"),
    searchParams,
  ]);
  if (ctx.membership.role === "staff") return <p className="text-muted-foreground text-sm">{tVendor("ownerOnly")}</p>;

  const all = sp.filter === "all";
  const rows = await listOrgEnquiries(ctx.membership.organization_id, !all);
  type Row = (typeof rows)[number];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className="flex gap-1">
            <Button asChild size="sm" variant={all ? "ghost" : "secondary"}>
              <Link href="/vendor/enquiries">{t("filterActive")}</Link>
            </Button>
            <Button asChild size="sm" variant={all ? "secondary" : "ghost"}>
              <Link href={{ pathname: "/vendor/enquiries", query: { filter: "all" } }}>{t("filterAll")}</Link>
            </Button>
          </div>
        }
      />
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        caption={t("title")}
        empty={<EmptyState icon={Inbox} title={t("empty")} description={t("emptyBody")} />}
        columns={[
          {
            key: "listing",
            header: t("colListing"),
            cell: (r) => <span className="font-medium">{r.services?.title ?? "—"}</span>,
          },
          {
            key: "date",
            header: t("colDate"),
            cell: (r) => formatDateTime(`${r.event_date}T00:00:00Z`, locale, "UTC", { dateStyle: "medium" }),
          },
          { key: "status", header: t("colStatus"), cell: (r) => <StatusBadge status={r.status} /> },
          {
            key: "hold",
            header: t("colHold"),
            cell: (r) => (r.hold_expires_at ? formatDateTime(r.hold_expires_at, locale) : "—"),
            hideOnMobile: true,
          },
          {
            key: "open",
            header: "",
            className: "text-right",
            cell: (r) => (
              <Button asChild size="sm">
                <Link href={`/vendor/enquiries/${r.id}`}>{t("open")}</Link>
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
