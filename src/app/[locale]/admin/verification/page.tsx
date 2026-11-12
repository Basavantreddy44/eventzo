import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BadgeCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { localizedPath } from "@/lib/auth/portal-user";
import { createClient } from "@/lib/supabase/server";
import { localeFrom } from "@/i18n/params";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/verification">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "admin.verification" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VerificationQueuePage({ params }: PageProps<"/[locale]/admin/verification">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/admin/verification"));
  const [t, tAdmin] = await Promise.all([getTranslations("admin.verification"), getTranslations("admin.dashboard")]);
  if (!hasPermission(user.access, "verification.manage")) {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("title")} />
        <Card>
          <CardContent>{tAdmin("noPermission")}</CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, status, verification_status, updated_at, business_documents(id, status)")
    .eq("verification_status", "pending")
    .order("updated_at")
    .limit(200);
  if (error) throw new Error(`Failed to load verification queue: ${error.message}`);
  const rows = data ?? [];
  type Row = (typeof rows)[number];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        caption={t("title")}
        empty={<EmptyState icon={BadgeCheck} title={t("empty")} />}
        columns={[
          { key: "vendor", header: t("colVendor"), cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "status", header: t("colStatus"), cell: (r) => <StatusBadge status={r.status} />, hideOnMobile: true },
          {
            key: "docs",
            header: t("colDocuments"),
            cell: (r) =>
              `${r.business_documents.filter((d) => d.status === "uploaded").length} / ${r.business_documents.length}`,
          },
          {
            key: "since",
            header: t("colSince"),
            cell: (r) => formatDateTime(r.updated_at, locale, undefined, { dateStyle: "medium" }),
            hideOnMobile: true,
          },
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (r) => (
              <Button asChild size="sm">
                <Link href={`/admin/verification/${r.id}`}>{t("review")}</Link>
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
