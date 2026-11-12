import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ScrollText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/auth/permissions";
import { localizedPath } from "@/lib/auth/portal-user";
import { getAdminOverview, type AdminOverview } from "@/features/admin/queries/admin-overview";
import { localeFrom } from "@/i18n/params";

// Auth-gated (the layout may render Access denied instead of this page).
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "admin.dashboard" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AdminDashboardPage({ params }: PageProps<"/[locale]/admin">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/admin"));
  if (!isPlatformAdmin(user.access)) return null; // the layout renders <AccessDenied/>

  const [t, data] = await Promise.all([getTranslations("admin.dashboard"), getAdminOverview(user)]);
  const noPermission = <p className="text-muted-foreground text-sm">{t("noPermission")}</p>;

  type AuditEntry = NonNullable<AdminOverview["recentAudit"]>[number];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="gap-3">
          <CardHeader>
            <CardDescription>{t("organizations")}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{data.organizationsTotal ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.organizationsByStatus ? (
              <ul className="flex flex-wrap gap-2" aria-label={t("organizationsByStatus")}>
                {data.organizationsByStatus.map((s) => (
                  <li key={s.status} className="flex items-center gap-1.5 text-sm">
                    <StatusBadge status={s.status} />
                    <span className="tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              noPermission
            )}
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardDescription>{t("verificationQueue")}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{data.verificationQueue ?? "—"}</CardTitle>
          </CardHeader>
          {data.verificationQueue === null ? <CardContent>{noPermission}</CardContent> : null}
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardDescription>{t("users")}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{data.usersTotal ?? "—"}</CardTitle>
          </CardHeader>
          {data.usersTotal === null ? <CardContent>{noPermission}</CardContent> : null}
        </Card>
      </div>

      <section className="grid min-w-0 gap-3" aria-labelledby="audit-heading">
        <h2 id="audit-heading" className="text-lg font-semibold">
          {t("recentAudit")}
        </h2>
        {data.recentAudit === null ? (
          <Card>
            <CardContent>{noPermission}</CardContent>
          </Card>
        ) : (
          <DataTable<AuditEntry>
            rows={data.recentAudit}
            rowKey={(r) => String(r.id)}
            caption={t("recentAudit")}
            empty={<EmptyState icon={ScrollText} title={t("auditEmpty")} />}
            columns={[
              { key: "when", header: t("colWhen"), cell: (r) => formatDateTime(r.occurred_at, locale) },
              { key: "action", header: t("colAction"), cell: (r) => <code className="text-xs">{r.action}</code> },
              {
                key: "entity",
                header: t("colEntity"),
                cell: (r) => (
                  <span className="text-muted-foreground font-mono text-xs">{r.entity_id?.slice(0, 8) ?? "—"}</span>
                ),
                hideOnMobile: true,
              },
              {
                key: "actor",
                header: t("colActor"),
                cell: (r) => (
                  <span className="text-muted-foreground font-mono text-xs">
                    {r.actor_user_id?.slice(0, 8) ?? "system"}
                  </span>
                ),
                hideOnMobile: true,
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}
