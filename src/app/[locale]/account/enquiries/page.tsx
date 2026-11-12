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
import { requireUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { listMyEnquiries, snapshotOf } from "@/features/enquiries/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/account/enquiries">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "enquiries" });
  return { title: t("title"), robots: { index: false } };
}

export default async function MyEnquiriesPage({ params }: PageProps<"/[locale]/account/enquiries">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/account/enquiries"));
  const [t, rows] = await Promise.all([getTranslations("enquiries"), listMyEnquiries(user.id)]);
  type Row = (typeof rows)[number];
  const active = new Set(["open", "quoted", "accepted", "reserved"]);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        caption={t("title")}
        empty={
          <EmptyState
            icon={Inbox}
            title={t("empty")}
            description={t("emptyBody")}
            action={
              <Button asChild>
                <Link href="/search">{t("findVendors")}</Link>
              </Button>
            }
          />
        }
        columns={[
          {
            key: "listing",
            header: t("colListing"),
            cell: (r) => {
              const snap = snapshotOf(r.price_snapshot);
              return (
                <div className="grid gap-0.5">
                  <span className="font-medium">{snap.title ?? "—"}</span>
                  <span className="text-muted-foreground text-xs">{snap.vendor_name}</span>
                </div>
              );
            },
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
            cell: (r) => (r.hold_expires_at && active.has(r.status) ? formatDateTime(r.hold_expires_at, locale) : "—"),
            hideOnMobile: true,
          },
          {
            key: "open",
            header: "",
            className: "text-right",
            cell: (r) => (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/account/enquiries/${r.id}`}>{t("open")}</Link>
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
