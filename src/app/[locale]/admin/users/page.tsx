import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { NoPermission } from "@/features/admin/components/no-permission";
import { Pager } from "@/features/admin/components/pager";
import { loadAdminPage } from "@/features/admin/lib/page";
import { listUsers } from "@/features/admin/queries";
import { pageOf } from "@/features/admin/schemas";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/users">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "admin.users" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AdminUsersPage({ params, searchParams }: PageProps<"/[locale]/admin/users">) {
  const { locale, allowed } = await loadAdminPage(params, "/admin/users", "users.read");
  const [t, tRoles] = await Promise.all([getTranslations("admin.users"), getTranslations("roles")]);
  if (!allowed) return <NoPermission title={t("title")} />;

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const page = pageOf(sp.page);
  const { rows, total } = await listUsers(q, page);
  type Row = (typeof rows)[number];
  const roleName = (r: string) => (tRoles.has(r as "customer") ? tRoles(r as "customer") : r);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <form method="get" className="flex flex-wrap items-end gap-2" aria-label={t("search")}>
        <label className="grid gap-1 text-xs">
          {t("search")}
          <Input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="h-9 w-72" />
        </label>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          {t("apply")}
        </Button>
      </form>
      <p className="text-muted-foreground text-sm">{t("count", { count: total })}</p>
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        caption={t("title")}
        empty={<EmptyState icon={Users} title={t("empty")} />}
        columns={[
          {
            key: "name",
            header: t("colName"),
            cell: (r) => (
              <div className="grid gap-0.5">
                <Link
                  href={`/admin/users/${r.id}`}
                  className="text-primary font-medium underline-offset-4 hover:underline"
                >
                  {r.full_name || r.email || r.id.slice(0, 8)}
                </Link>
                <span className="text-muted-foreground text-xs">{[r.email, r.phone].filter(Boolean).join(" · ")}</span>
              </div>
            ),
          },
          {
            key: "roles",
            header: t("colRoles"),
            cell: (r) => (
              <span className="text-xs">
                {r.roles
                  .filter((x) => x !== "customer")
                  .map(roleName)
                  .join(", ") || roleName("customer")}
                {r.vendor_count > 0 ? ` · ${t("vendorOf", { count: r.vendor_count })}` : ""}
              </span>
            ),
            hideOnMobile: true,
          },
          {
            key: "status",
            header: t("colStatus"),
            cell: (r) => <StatusBadge status={r.blocked_at ? "blocked_user" : "active"} />,
          },
          {
            key: "last",
            header: t("colLastSignIn"),
            cell: (r) => (r.last_sign_in_at ? formatDateTime(r.last_sign_in_at, locale) : "—"),
            hideOnMobile: true,
          },
        ]}
      />
      <Pager pathname="/admin/users" query={q ? { q } : {}} page={page} total={total} />
    </div>
  );
}
