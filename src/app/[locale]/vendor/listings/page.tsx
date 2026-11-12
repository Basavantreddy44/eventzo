import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Pencil, Plus, Store } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { localeFrom } from "@/i18n/params";
import { formatListingPrice, type PriceTranslator } from "@/features/discovery/lib/price";
import { loadVendorPage } from "@/features/vendor/lib/page";
import { getListings } from "@/features/vendor/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/listings">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendor.listings" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VendorListingsPage({ params }: PageProps<"/[locale]/vendor/listings">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/listings");
  if (!ctx) return null;
  const [t, tPrice, listings] = await Promise.all([
    getTranslations("vendor.listings"),
    getTranslations("listing.price"),
    getListings(ctx.membership.organization_id, ctx.activeBranchId),
  ]);
  const canEdit = ctx.membership.role !== "staff";
  type Row = (typeof listings)[number];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/vendor/listings/new">
                <Plus aria-hidden />
                {t("new")}
              </Link>
            </Button>
          ) : null
        }
      />
      <DataTable<Row>
        rows={listings}
        rowKey={(r) => r.id}
        caption={t("title")}
        empty={
          <EmptyState
            icon={Store}
            title={t("empty")}
            description={t("emptyBody")}
            action={
              canEdit ? (
                <Button asChild>
                  <Link href="/vendor/listings/new">{t("new")}</Link>
                </Button>
              ) : null
            }
          />
        }
        columns={[
          { key: "title", header: t("colTitle"), cell: (r) => <span className="font-medium">{r.title}</span> },
          {
            key: "category",
            header: t("colCategory"),
            cell: (r) => r.service_categories?.name ?? "—",
            hideOnMobile: true,
          },
          {
            key: "price",
            header: t("colPrice"),
            cell: (r) => formatListingPrice(r, tPrice as unknown as PriceTranslator, locale),
            hideOnMobile: true,
          },
          { key: "status", header: t("colStatus"), cell: (r) => <StatusBadge status={r.status} /> },
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (r) => (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/vendor/listings/${r.id}`}>
                  <Pencil aria-hidden />
                  {t("edit")}
                </Link>
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
