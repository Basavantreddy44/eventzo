import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { LifeBuoy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { SupportStatusBadge } from "@/features/support/components/support-status";
import { getSupportQueue, type QueueFilter } from "@/features/support/queries";
import { isOverdue, ticketRef } from "@/features/support/schemas";

export const instant = false;

const FILTERS: QueueFilter[] = ["active", "overdue", "mine", "closed", "all"];

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/support">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "support.desk" });
  return { title: t("title"), robots: { index: false } };
}

export default async function SupportDeskPage({ params, searchParams }: PageProps<"/[locale]/admin/support">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/admin/support"));
  const [t, tSupport, tAdmin, sp] = await Promise.all([
    getTranslations("support.desk"),
    getTranslations("support"),
    getTranslations("admin.dashboard"),
    searchParams,
  ]);

  if (!hasPermission(user.access, "support.manage")) {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("title")} />
        <Card>
          <CardContent>{tAdmin("noPermission")}</CardContent>
        </Card>
      </div>
    );
  }

  await connection();
  const filter = FILTERS.includes(sp.filter as QueueFilter) ? (sp.filter as QueueFilter) : "active";
  const rows = await getSupportQueue(filter, user.id);
  const now = new Date();
  type Row = (typeof rows)[number];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Button key={f} asChild size="sm" variant={f === filter ? "secondary" : "ghost"}>
                <Link href={{ pathname: "/admin/support", query: f === "active" ? {} : { filter: f } }}>
                  {t(`filters.${f}`)}
                </Link>
              </Button>
            ))}
          </div>
        }
      />
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        caption={t("title")}
        empty={<EmptyState icon={LifeBuoy} title={t("empty")} description={t("emptyBody")} />}
        columns={[
          {
            key: "ref",
            header: tSupport("colRef"),
            cell: (r) => (
              <div className="grid gap-1">
                <span className="font-medium">{ticketRef(r.ref_no)}</span>
                {r.priority === "high" ? <Badge variant="destructive">{tSupport("priorities.high")}</Badge> : null}
              </div>
            ),
          },
          {
            key: "topic",
            header: tSupport("colTopic"),
            cell: (r) => (
              <div className="grid gap-0.5">
                <span className="font-medium">{tSupport(`topics.${r.topic as "other"}`)}</span>
                <span className="text-muted-foreground text-xs">
                  {r.profiles?.full_name ?? "—"}
                  {r.organizations?.name ? ` → ${r.organizations.name}` : ""}
                </span>
              </div>
            ),
          },
          { key: "status", header: tSupport("status"), cell: (r) => <SupportStatusBadge status={r.status} /> },
          {
            key: "sla",
            header: t("colReplyBy"),
            cell: (r) =>
              r.first_response_at ? (
                <span className="text-muted-foreground text-xs">{t("answered")}</span>
              ) : (
                <span
                  className={isOverdue(r, now) ? "text-destructive text-xs font-semibold" : "text-xs"}
                  data-testid={isOverdue(r, now) ? "sla-overdue" : undefined}
                >
                  {isOverdue(r, now) ? `${t("overdue")} · ` : ""}
                  {formatDateTime(r.sla_due_at, locale)}
                </span>
              ),
          },
          {
            key: "opened",
            header: tSupport("colOpened"),
            cell: (r) => formatDateTime(r.created_at, locale),
            hideOnMobile: true,
          },
          {
            key: "open",
            header: "",
            className: "text-right",
            cell: (r) => (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/admin/support/${r.id}`}>{tSupport("view")}</Link>
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
