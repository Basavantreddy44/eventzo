import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Store } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { NoPermission } from "@/features/admin/components/no-permission";
import { Pager } from "@/features/admin/components/pager";
import { loadAdminPage } from "@/features/admin/lib/page";
import { listVendors } from "@/features/admin/queries";
import { pageOf } from "@/features/admin/schemas";
import type { OrganizationStatus } from "@/types/database";

export const instant = false;

const STATUSES: OrganizationStatus[] = ["active", "draft", "pending_review", "suspended", "closed"];

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/vendors">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "admin.vendors" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AdminVendorsPage({ params, searchParams }: PageProps<"/[locale]/admin/vendors">) {
  const { locale, allowed } = await loadAdminPage(params, "/admin/vendors", "organizations.read");
  const t = await getTranslations("admin.vendors");
  if (!allowed) return <NoPermission title={t("title")} />;

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const status = STATUSES.find((s) => s === sp.status) ?? null;
  const page = pageOf(sp.page);
  const { rows, total } = await listVendors(q, status, page);
  const query: Record<string, string> = {};
  if (q) query.q = q;
  if (status) query.status = status;
  type Row = (typeof rows)[number];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <form method="get" className="flex flex-wrap items-end gap-2" aria-label={t("filter")}>
        <label className="grid gap-1 text-xs">
          {t("search")}
          <Input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="h-9 w-64" />
        </label>
        <label className="grid gap-1 text-xs">
          {t("status")}
          <NativeSelect name="status" defaultValue={status ?? ""} className="h-9 w-auto">
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          {t("apply")}
        </Button>
      </form>
      <p className="text-muted-foreground text-sm" data-testid="vendor-count">
        {t("count", { count: total })}
      </p>
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        caption={t("title")}
        empty={<EmptyState icon={Store} title={t("empty")} />}
        columns={[
          {
            key: "name",
            header: t("colName"),
            cell: (r) => (
              <div className="grid gap-0.5">
                <Link
                  href={`/admin/vendors/${r.id}`}
                  className="text-primary font-medium underline-offset-4 hover:underline"
                >
                  {r.name}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {[r.category, r.city, r.owner_email].filter(Boolean).join(" · ")}
                </span>
              </div>
            ),
          },
          { key: "status", header: t("colStatus"), cell: (r) => <StatusBadge status={r.status} /> },
          {
            key: "verification",
            header: t("colVerification"),
            cell: (r) => <StatusBadge status={r.verification_status} />,
            hideOnMobile: true,
          },
          {
            key: "listings",
            header: t("colListings"),
            cell: (r) => r.listings,
            className: "text-right tabular-nums",
            hideOnMobile: true,
          },
          {
            key: "bookings",
            header: t("colBookings"),
            cell: (r) => r.bookings,
            className: "text-right tabular-nums",
            hideOnMobile: true,
          },
          {
            key: "created",
            header: t("colCreated"),
            cell: (r) => formatDateTime(r.created_at, locale, undefined, { dateStyle: "medium" }),
            hideOnMobile: true,
          },
        ]}
      />
      <Pager pathname="/admin/vendors" query={query} page={page} total={total} />
    </div>
  );
}
