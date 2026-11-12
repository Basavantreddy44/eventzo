import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/auth/permissions";
import { localeFrom } from "@/i18n/params";
import { VendorStatusActions } from "@/features/admin/components/admin-forms";
import { NoPermission } from "@/features/admin/components/no-permission";
import { loadAdminPage } from "@/features/admin/lib/page";
import { getVendorAdmin } from "@/features/admin/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/vendors/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "admin.vendors" });
  return { title: t("detailTitle"), robots: { index: false } };
}

export default async function AdminVendorPage({ params }: PageProps<"/[locale]/admin/vendors/[id]">) {
  const { locale, user, allowed } = await loadAdminPage(params, "/admin/vendors", "organizations.read");
  const t = await getTranslations("admin.vendors");
  if (!allowed) return <NoPermission title={t("detailTitle")} />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getVendorAdmin(id);
  if (!data) notFound();
  const { organization: o, profile, branches, listings, members, overview } = data;
  const canManage = hasPermission(user.access, "organizations.manage");
  const canVerify = hasPermission(user.access, "verification.manage");
  const city = (o.cities as unknown as { name: string } | null)?.name;
  const category = (o.business_categories as unknown as { name: string } | null)?.name;

  const stat = (label: string, value: React.ReactNode, testId?: string) => (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-lg font-semibold tabular-nums" data-testid={testId}>
        {value}
      </span>
    </div>
  );

  return (
    <div className="grid gap-6">
      <Link
        href="/admin/vendors"
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={o.name}
        description={[category, city, o.legal_name].filter(Boolean).join(" · ")}
        actions={
          <div className="flex flex-wrap gap-2" data-testid="vendor-badges">
            <StatusBadge status={o.status} />
            <StatusBadge status={o.verification_status} />
          </div>
        }
      />

      {o.status_reason && (o.status === "suspended" || o.status === "closed") ? (
        <p
          className="border-destructive/40 bg-destructive/5 rounded-md border px-3 py-2 text-sm"
          data-testid="status-reason"
        >
          {t("statusReason", {
            reason: o.status_reason,
            date: o.status_changed_at ? formatDateTime(o.status_changed_at, locale) : "",
          })}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          {overview ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("activity")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {stat(t("statPublished"), overview.listings.published)}
                {stat(t("statEnquiries90"), overview.enquiries_90d)}
                {stat(t("statUpcoming"), overview.bookings.confirmed_upcoming, "stat-upcoming")}
                {stat(
                  t("statVendorCancels"),
                  `${overview.bookings.cancelled_by_vendor} / ${overview.bookings.cancelled_total}`,
                )}
                {overview.money ? stat(t("statReceived"), formatPaise(overview.money.received_paise)) : null}
                {overview.money ? stat(t("statOnline"), formatPaise(overview.money.online_paise)) : null}
                {overview.money ? stat(t("statOffline"), formatPaise(overview.money.offline_paise)) : null}
                {overview.refunds_pending !== null ? stat(t("statRefundsPending"), overview.refunds_pending) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("contact")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>{profile?.contact_phone ?? "—"}</p>
              <p>{profile?.contact_email ?? "—"}</p>
              {profile?.website ? <p>{profile.website}</p> : null}
              {profile?.gstin ? <p className="text-muted-foreground">GSTIN {profile.gstin}</p> : null}
              <p className="text-muted-foreground mt-2 text-xs">
                {t("joined", { date: formatDateTime(o.created_at, locale, undefined, { dateStyle: "medium" }) })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("listings")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {listings.length === 0 ? <p className="text-muted-foreground">{t("noListings")}</p> : null}
              {listings.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  {l.status === "published" && o.status === "active" ? (
                    <Link href={`/listings/${l.slug}`} className="text-primary underline-offset-4 hover:underline">
                      {l.title}
                    </Link>
                  ) : (
                    <span>{l.title}</span>
                  )}
                  <StatusBadge status={l.status} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("team")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {members.map((m) => (
                <div key={m.member_id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {m.full_name || m.display_name || "—"}
                    {m.email ? <span className="text-muted-foreground"> · {m.email}</span> : null}
                  </span>
                  <span className="text-muted-foreground text-xs">{m.role}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("branches")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {branches.map((b) => (
                <p key={b.id}>
                  {b.name}
                  <span className="text-muted-foreground">
                    {[b.address_line1, b.pincode, b.phone].filter(Boolean).length
                      ? ` · ${[b.address_line1, b.pincode, b.phone].filter(Boolean).join(", ")}`
                      : ""}
                  </span>
                </p>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("statusTitle")}</CardTitle>
              <p className="text-muted-foreground text-sm">{t("statusHint")}</p>
            </CardHeader>
            <CardContent>
              {canManage ? (
                <VendorStatusActions organizationId={o.id} name={o.name} status={o.status} />
              ) : (
                <p className="text-muted-foreground text-sm">{t("manageOnly")}</p>
              )}
            </CardContent>
          </Card>
          {canVerify ? (
            <Link
              href={`/admin/verification/${o.id}`}
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              {t("toVerification")}
            </Link>
          ) : null}
          <Link
            href={{ pathname: "/admin/audit", query: { org: o.id } }}
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            {t("toAudit")}
          </Link>
        </div>
      </div>
    </div>
  );
}
