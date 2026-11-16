import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BellRing, Inbox } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { todayIn } from "@/features/muhurtham/lib/calendar";
import { getVendorLeads } from "@/features/vendor/queries";
import { loadVendorPage } from "@/features/vendor/lib/page";

export const instant = false;

const STAGE_VARIANT = { new: "warning", quoted: "info", won: "success", lost: "muted" } as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/enquiries">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendorEnquiries" });
  return { title: t("title"), robots: { index: false } };
}

/** Roadmap V8: enquiries as a simple leads list — stage, last contact and a "Remind me" date. */
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
  const rows = await getVendorLeads(ctx.membership.organization_id, !all);
  const today = todayIn("Asia/Kolkata");
  type Row = (typeof rows)[number];
  const day = (d: string) => formatDateTime(`${d}T00:00:00Z`, locale, "UTC", { dateStyle: "medium" });

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
            cell: (r) => (
              <div className="grid gap-0.5">
                <span className="font-medium">{r.listing_title}</span>
                <span className="text-muted-foreground text-xs">
                  {r.customer_name}
                  {r.guests ? ` · ${t("guestsShort", { count: r.guests })}` : ""}
                </span>
              </div>
            ),
          },
          { key: "date", header: t("colDate"), cell: (r) => day(r.event_date) },
          {
            key: "stage",
            header: t("colStage"),
            cell: (r) => (
              <div className="flex flex-wrap items-center gap-1" data-testid="lead-stage">
                <Badge variant={STAGE_VARIANT[r.stage as keyof typeof STAGE_VARIANT] ?? "outline"}>
                  {t(`stages.${r.stage as "new"}`)}
                </Badge>
                <StatusBadge status={r.status} className="hidden sm:inline-flex" />
              </div>
            ),
          },
          {
            key: "contact",
            header: t("colLastContact"),
            cell: (r) => (r.last_contact_at ? formatDateTime(r.last_contact_at, locale) : "—"),
            hideOnMobile: true,
          },
          {
            key: "follow",
            header: t("colFollowUp"),
            cell: (r) =>
              r.follow_up_on ? (
                <span
                  className={`inline-flex items-center gap-1 text-xs ${r.follow_up_on <= today ? "text-destructive font-semibold" : ""}`}
                  data-testid="lead-follow-up"
                  title={r.follow_up_note ?? undefined}
                >
                  <BellRing className="size-3" aria-hidden />
                  {day(r.follow_up_on)}
                </span>
              ) : r.stage === "new" && r.hold_expires_at ? (
                <span className="text-muted-foreground text-xs">
                  {t("holdUntil", { time: formatDateTime(r.hold_expires_at, locale) })}
                </span>
              ) : (
                "—"
              ),
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
