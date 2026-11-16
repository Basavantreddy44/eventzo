import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LifeBuoy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { bookingSnapshotOf } from "@/features/bookings/queries";
import { SupportStatusBadge } from "@/features/support/components/support-status";
import { getMyTickets } from "@/features/support/queries";
import { ticketRef } from "@/features/support/schemas";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/account/support">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "support" });
  return { title: t("title"), robots: { index: false } };
}

export default async function MySupportPage({ params }: PageProps<"/[locale]/account/support">) {
  const locale = await localeFrom(params);
  await requireUser(locale, localizedPath(locale, "/account/support"));
  const [t, rows] = await Promise.all([getTranslations("support"), getMyTickets()]);
  type Row = (typeof rows)[number];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        caption={t("title")}
        empty={
          <EmptyState
            icon={LifeBuoy}
            title={t("empty")}
            description={t("emptyBody")}
            action={
              <Button asChild>
                <Link href="/account/bookings">{t("toBookings")}</Link>
              </Button>
            }
          />
        }
        columns={[
          { key: "ref", header: t("colRef"), cell: (r) => ticketRef(r.ref_no) },
          {
            key: "topic",
            header: t("colTopic"),
            cell: (r) => (
              <div className="grid gap-0.5">
                <span className="font-medium">{t(`topics.${r.topic as "other"}`)}</span>
                <span className="text-muted-foreground text-xs">
                  {bookingSnapshotOf(r.booking_items?.snapshot ?? null).listing?.title ?? ""}
                </span>
              </div>
            ),
          },
          { key: "status", header: t("status"), cell: (r) => <SupportStatusBadge status={r.status} /> },
          {
            key: "opened",
            header: t("colOpened"),
            cell: (r) => formatDateTime(r.created_at, locale),
            hideOnMobile: true,
          },
          {
            key: "open",
            header: "",
            className: "text-right",
            cell: (r) => (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/account/support/${r.id}`}>{t("view")}</Link>
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
