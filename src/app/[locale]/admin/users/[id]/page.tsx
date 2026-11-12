import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { hasPermission } from "@/lib/auth/permissions";
import { localeFrom } from "@/i18n/params";
import { RoleToggles, UserBlockActions } from "@/features/admin/components/admin-forms";
import { NoPermission } from "@/features/admin/components/no-permission";
import { loadAdminPage } from "@/features/admin/lib/page";
import { getUserOverview } from "@/features/admin/queries";
import { STAFF_ROLES } from "@/features/admin/schemas";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/users/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "admin.users" });
  return { title: t("detailTitle"), robots: { index: false } };
}

/** Read-only support view of one person. Opening it is recorded in the audit log. */
export default async function AdminUserPage({ params }: PageProps<"/[locale]/admin/users/[id]">) {
  const { locale, user, allowed } = await loadAdminPage(params, "/admin/users", "users.read");
  const [t, tRoles] = await Promise.all([getTranslations("admin.users"), getTranslations("roles")]);
  if (!allowed) return <NoPermission title={t("detailTitle")} />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const u = await getUserOverview(id);
  if (!u) notFound();

  const p = u.profile;
  const name = p.full_name || p.display_name || p.email || id.slice(0, 8);
  const roles = u.roles.map((r) => r.code);
  const isSelf = id === user.id;
  const canBlock = hasPermission(user.access, "users.block") && !isSelf;
  const canRoles = hasPermission(user.access, "roles.manage");
  const date = (iso: string | null) => (iso ? formatDateTime(iso, locale) : "—");
  const day = (d: string) => formatDateTime(`${d}T12:00:00+05:30`, locale, undefined, { dateStyle: "medium" });
  const roleName = (r: string) => (tRoles.has(r as "customer") ? tRoles(r as "customer") : r);

  return (
    <div className="grid gap-6">
      <Link
        href="/admin/users"
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={name}
        description={[p.email, p.phone].filter(Boolean).join(" · ")}
        actions={<StatusBadge status={p.blocked_at ? "blocked_user" : "active"} />}
      />
      <p className="text-muted-foreground -mt-3 text-xs">{t("auditedNotice")}</p>
      {p.blocked_at ? (
        <p
          className="border-destructive/40 bg-destructive/5 rounded-md border px-3 py-2 text-sm"
          data-testid="blocked-reason"
        >
          {t("blockedSince", { date: date(p.blocked_at), reason: p.blocked_reason ?? "" })}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("account")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>{t("joinedOn", { date: date(p.created_at) })}</p>
              <p>{t("lastSignIn", { date: date(p.last_sign_in_at) })}</p>
              <p>{p.email_confirmed_at ? t("emailConfirmed") : t("emailNotConfirmed")}</p>
              <p>{t("rolesAre", { roles: roles.map(roleName).join(", ") || "—" })}</p>
              <p>{t("eventsCount", { count: u.events })}</p>
              {u.memberships.map((m) => (
                <p key={m.organization_id}>
                  <Link
                    href={`/admin/vendors/${m.organization_id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {m.organization_name}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    · {m.role} · {m.status}
                  </span>
                </p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("enquiries")}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                rows={u.enquiries}
                rowKey={(e) => e.id}
                caption={t("enquiries")}
                empty={<p className="text-muted-foreground text-sm">{t("none")}</p>}
                columns={[
                  { key: "l", header: t("colListing"), cell: (e) => `${e.listing} · ${e.vendor}` },
                  { key: "d", header: t("colDate"), cell: (e) => day(e.event_date), hideOnMobile: true },
                  { key: "s", header: t("colStatus"), cell: (e) => <StatusBadge status={e.status} /> },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("bookings")}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                rows={u.bookings}
                rowKey={(b) => b.id}
                caption={t("bookings")}
                empty={<p className="text-muted-foreground text-sm">{t("none")}</p>}
                columns={[
                  { key: "l", header: t("colListing"), cell: (b) => `${b.listing ?? "—"} · ${b.vendor}` },
                  { key: "d", header: t("colDate"), cell: (b) => day(b.event_date), hideOnMobile: true },
                  {
                    key: "m",
                    header: t("colPaid"),
                    cell: (b) =>
                      b.total_paise !== null
                        ? `${formatPaise(b.paid_paise ?? 0)} / ${formatPaise(b.total_paise)}`
                        : "—",
                    hideOnMobile: true,
                  },
                  { key: "s", header: t("colStatus"), cell: (b) => <StatusBadge status={b.status} /> },
                ]}
              />
            </CardContent>
          </Card>

          {u.payments ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("payments")}</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  rows={u.payments}
                  rowKey={(x) => x.id}
                  caption={t("payments")}
                  empty={<p className="text-muted-foreground text-sm">{t("none")}</p>}
                  columns={[
                    {
                      key: "a",
                      header: t("colAmount"),
                      cell: (x) => `${formatPaise(x.amount_paise)} · ${x.vendor}`,
                    },
                    { key: "r", header: t("colReceipt"), cell: (x) => x.receipt_number ?? "—", hideOnMobile: true },
                    {
                      key: "d",
                      header: t("colDate"),
                      cell: (x) => date(x.paid_at ?? x.created_at),
                      hideOnMobile: true,
                    },
                    { key: "s", header: t("colStatus"), cell: (x) => <StatusBadge status={x.status} /> },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}

          {u.activity ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("activity")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {u.activity.length === 0 ? <p className="text-muted-foreground">{t("none")}</p> : null}
                {u.activity.map((a) => (
                  <p key={a.id}>
                    <span className="text-muted-foreground">{date(a.occurred_at)}</span> ·{" "}
                    <code className="text-xs">{a.action}</code>
                  </p>
                ))}
                <Link
                  href={{ pathname: "/admin/audit", query: { actor: id } }}
                  className="text-primary mt-2 text-sm underline-offset-4 hover:underline"
                >
                  {t("fullActivity")}
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="grid content-start gap-6">
          {canBlock ? (
            <Card>
              <CardHeader>
                <CardTitle>{p.blocked_at ? t("unblockCard") : t("blockCard")}</CardTitle>
                <p className="text-muted-foreground text-sm">{t("blockHint")}</p>
              </CardHeader>
              <CardContent>
                <UserBlockActions userId={id} name={name} blocked={!!p.blocked_at} />
              </CardContent>
            </Card>
          ) : null}
          {canRoles ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("staffRoles")}</CardTitle>
                <p className="text-muted-foreground text-sm">{t("staffRolesHint")}</p>
              </CardHeader>
              <CardContent>
                <RoleToggles userId={id} roles={roles} roleCodes={STAFF_ROLES} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
