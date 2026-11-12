import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Mail, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { removeMember, revokeInvitation } from "@/features/vendor/actions/team";
import { InviteForm } from "@/features/vendor/components/invite-form";
import { MemberRoleSelect } from "@/features/vendor/components/member-role-select";
import { loadVendorPage } from "@/features/vendor/lib/page";
import { getTeam } from "@/features/vendor/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/team">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendor.team" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VendorTeamPage({ params }: PageProps<"/[locale]/vendor/team">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/team");
  if (!ctx) return null;
  const isOwner = ctx.membership.role === "owner";
  const [t, tRoles, { members, invitations }] = await Promise.all([
    getTranslations("vendor.team"),
    getTranslations("roles"),
    getTeam(ctx.membership.organization_id, isOwner),
  ]);
  const branchName = new Map(ctx.branches.map((b) => [b.id, b.name]));
  type Member = (typeof members)[number];
  type Invite = (typeof invitations)[number];

  const branchesOf = (role: string, ids: string[]) =>
    role === "owner"
      ? t("allBranches")
      : ids
          .map((id) => branchName.get(id))
          .filter(Boolean)
          .join(", ") || "—";

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle", { name: ctx.membership.organization_name })} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          <DataTable<Member>
            rows={members}
            rowKey={(m) => m.member_id}
            caption={t("title")}
            empty={<EmptyState icon={Users} title={t("title")} />}
            columns={[
              {
                key: "name",
                header: t("colName"),
                cell: (m) => (
                  <div className="grid gap-0.5">
                    <span className="font-medium">
                      {m.display_name || m.full_name || m.email || "—"}{" "}
                      {m.user_id === ctx.user.id ? (
                        <span className="text-muted-foreground font-normal">{t("you")}</span>
                      ) : null}
                    </span>
                    {m.email ? <span className="text-muted-foreground text-xs">{m.email}</span> : null}
                  </div>
                ),
              },
              {
                key: "role",
                header: t("colRole"),
                cell: (m) =>
                  isOwner ? (
                    <MemberRoleSelect memberId={m.member_id} role={m.role} label={t("role")} />
                  ) : (
                    <Badge variant="outline">{tRoles(m.role)}</Badge>
                  ),
              },
              {
                key: "branches",
                header: t("colBranches"),
                cell: (m) => branchesOf(m.role, m.branch_ids),
                hideOnMobile: true,
              },
              {
                key: "actions",
                header: "",
                className: "text-right",
                cell: (m) =>
                  isOwner && m.user_id !== ctx.user.id ? (
                    <ActionButton
                      action={removeMember.bind(null, m.member_id)}
                      label={t("remove")}
                      successMessage={t("removed")}
                      confirm={{ title: t("removeTitle"), description: t("removeBody"), destructive: true }}
                    />
                  ) : null,
              },
            ]}
          />

          {isOwner ? (
            <section className="grid gap-3" aria-labelledby="pending-heading">
              <h2 id="pending-heading" className="text-lg font-semibold">
                {t("pending")}
              </h2>
              <DataTable<Invite>
                rows={invitations}
                rowKey={(i) => i.id}
                caption={t("pending")}
                empty={<p className="text-muted-foreground text-sm">{t("noPending")}</p>}
                columns={[
                  {
                    key: "email",
                    header: t("email"),
                    cell: (i) => (
                      <span className="inline-flex items-center gap-1.5 break-all">
                        <Mail className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                        {i.email}
                      </span>
                    ),
                  },
                  { key: "role", header: t("role"), cell: (i) => tRoles(i.role) },
                  {
                    key: "expires",
                    header: "",
                    cell: (i) =>
                      t("expires", { date: formatDateTime(i.expires_at, locale, undefined, { dateStyle: "medium" }) }),
                    hideOnMobile: true,
                  },
                  {
                    key: "actions",
                    header: "",
                    className: "text-right",
                    cell: (i) => (
                      <ActionButton
                        action={revokeInvitation.bind(null, i.id)}
                        label={t("revoke")}
                        successMessage={t("revoked")}
                      />
                    ),
                  },
                ]}
              />
            </section>
          ) : null}
        </div>

        {isOwner ? (
          <Card className="content-start">
            <CardHeader>
              <CardTitle>{t("invite")}</CardTitle>
            </CardHeader>
            <CardContent>
              <InviteForm branches={ctx.branches.map((b) => ({ id: b.id, label: b.name }))} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
