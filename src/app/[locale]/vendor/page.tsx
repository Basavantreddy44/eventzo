import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CalendarDays, CheckCircle2, CircleDashed } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/page-header";
import { getReadiness } from "@/features/vendor/queries";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/auth/portal-user";
import { getVendorContext } from "@/features/organizations/queries/vendor-context";
import { getVendorDashboard, type UpcomingReservation } from "@/features/organizations/queries/vendor-dashboard";
import { localeFrom } from "@/i18n/params";

// Auth-gated (the layout may render Access denied instead of this page).
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "vendor.dashboard" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VendorDashboardPage({ params }: PageProps<"/[locale]/vendor">) {
  const locale = await localeFrom(params);
  // Re-check here too: layouts don't re-run on every navigation.
  await requireUser(locale, localizedPath(locale, "/vendor"));
  const ctx = await getVendorContext();
  if (!ctx) return null; // the layout renders <AccessDenied/>

  const [t, tGo, tSource, data, readiness] = await Promise.all([
    getTranslations("vendor.dashboard"),
    getTranslations("vendor.golive"),
    getTranslations("reservationSource"),
    getVendorDashboard(ctx),
    getReadiness(ctx.membership.organization_id),
  ]);
  const tStatus = await getTranslations("status");
  const orgStatus = data.organization.status;

  const stats = [
    { label: t("branches"), value: data.branchCount },
    { label: t("resources"), value: data.resourceCount },
    { label: t("upcoming"), value: data.upcomingCount },
  ];

  // Mirrors the database go-live rule (private.try_activate_organization).
  const checklist = [
    { label: tGo("stepProfile"), done: readiness.profileComplete, href: "/vendor/profile" },
    { label: tGo("stepListing"), done: readiness.hasPublishedListing, href: "/vendor/listings" },
    { label: tGo("stepDocuments"), done: readiness.documentsUploaded, href: "/vendor/documents" },
    { label: t("checklistResources"), done: data.checklist.resourcesAdded, href: "/vendor/resources" },
  ];
  const golive =
    orgStatus === "active"
      ? { title: tGo("activeTitle"), body: tGo("activeBody"), tone: "border-success/30 bg-success/5" }
      : orgStatus === "draft"
        ? { title: tGo("draftTitle"), body: tGo("draftBody"), tone: "border-gold/40 bg-accent/40" }
        : {
            title: tGo("blockedTitle"),
            body: tGo("blockedBody", { status: tStatus(orgStatus) }),
            tone: "border-destructive/30 bg-destructive/5",
          };

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle", { name: data.organization.name })}
        actions={
          <>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              {t("status")} <StatusBadge status={data.organization.status} />
            </span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              {t("verification")} <StatusBadge status={data.organization.verification_status} />
            </span>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="gap-2">
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="grid min-w-0 content-start gap-3 lg:col-span-2" aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="text-lg font-semibold">
            {t("upcomingTitle")}
          </h2>
          <DataTable<UpcomingReservation>
            rows={data.upcoming}
            rowKey={(r) => r.id}
            caption={t("upcomingTitle")}
            empty={
              <EmptyState icon={CalendarDays} title={t("upcomingEmptyTitle")} description={t("upcomingEmptyBody")} />
            }
            columns={[
              {
                key: "resource",
                header: t("colResource"),
                cell: (r) => <span className="font-medium">{r.resourceName}</span>,
              },
              {
                key: "when",
                header: t("colWhen"),
                cell: (r) =>
                  `${formatDateTime(r.start, locale)} – ${formatDateTime(r.end, locale, undefined, { timeStyle: "short" })}`,
              },
              { key: "status", header: t("colStatus"), cell: (r) => <StatusBadge status={r.status} /> },
              { key: "source", header: t("colSource"), cell: (r) => tSource(r.source), hideOnMobile: true },
            ]}
          />
        </section>

        <Card className={`content-start ${golive.tone}`} data-testid="golive-card">
          <CardHeader>
            <CardTitle>{golive.title}</CardTitle>
            <CardDescription>{golive.body}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-start gap-3 text-sm">
                  {item.done ? (
                    <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
                  ) : (
                    <CircleDashed className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                  )}
                  <span className="grid gap-0.5">
                    {item.done ? (
                      <span className="text-muted-foreground line-through">{item.label}</span>
                    ) : (
                      <Link href={item.href} className="text-primary font-medium underline-offset-4 hover:underline">
                        {item.label}
                      </Link>
                    )}
                    {item.done ? <span className="text-muted-foreground text-xs">{t("checklistDone")}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
