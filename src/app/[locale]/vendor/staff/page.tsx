import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Pencil, UsersRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatPaise } from "@/lib/money";
import { localeFrom } from "@/i18n/params";
import { setStaffActive } from "@/features/staff/actions";
import { StaffForm } from "@/features/staff/components/staff-form";
import { listMemberOptions, listStaff } from "@/features/staff/queries";
import { loadVendorPage } from "@/features/vendor/lib/page";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/staff">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "staff" });
  return { title: t("title"), robots: { index: false } };
}

const toRupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

export default async function VendorStaffPage({ params, searchParams }: PageProps<"/[locale]/vendor/staff">) {
  const { ctx } = await loadVendorPage(params, "/vendor/staff");
  if (!ctx) return null;
  const t = await getTranslations("staff");
  const role = ctx.membership.role;
  if (role === "staff") {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <EmptyState icon={UsersRound} title={t("managersOnly")} />
      </div>
    );
  }
  const orgId = ctx.membership.organization_id;
  const [staff, members, sp] = await Promise.all([listStaff(orgId), listMemberOptions(orgId), searchParams]);
  const branchName = new Map(ctx.branches.map((b) => [b.id, b.name]));
  const memberName = new Map(members.map((m) => [m.id, m.label]));
  const editing = staff.find((s) => s.id === sp.edit);
  const linked = new Set(staff.filter((s) => s.member_id && s.id !== editing?.id).map((s) => s.member_id));
  type Row = (typeof staff)[number];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <DataTable<Row>
          rows={staff}
          rowKey={(r) => r.id}
          caption={t("title")}
          empty={<EmptyState icon={UsersRound} title={t("empty")} description={t("emptyHint")} />}
          columns={[
            {
              key: "name",
              header: t("colName"),
              cell: (r) => (
                <div className="grid gap-0.5">
                  <span className="font-medium">{r.full_name}</span>
                  <span className="text-muted-foreground text-xs">
                    {[r.skill, r.branch_id ? branchName.get(r.branch_id) : t("allBranches")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              ),
            },
            { key: "phone", header: t("colPhone"), cell: (r) => r.phone ?? "—", hideOnMobile: true },
            {
              key: "rate",
              header: t("colDayRate"),
              cell: (r) => (r.day_rate_paise !== null ? formatPaise(r.day_rate_paise, { currency: r.currency }) : "—"),
              hideOnMobile: true,
            },
            {
              key: "login",
              header: t("colLogin"),
              cell: (r) =>
                r.member_id ? (
                  <span className="text-xs">{memberName.get(r.member_id) ?? t("linked")}</span>
                ) : (
                  <span className="text-muted-foreground text-xs">{t("noLogin")}</span>
                ),
              hideOnMobile: true,
            },
            {
              key: "status",
              header: t("colStatus"),
              cell: (r) => <StatusBadge status={r.active ? "active" : "closed"} />,
            },
            {
              key: "actions",
              header: "",
              className: "text-right",
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={{ pathname: "/vendor/staff", query: { edit: r.id } }}>
                      <Pencil aria-hidden />
                      {t("edit")}
                    </Link>
                  </Button>
                  <ActionButton
                    action={setStaffActive.bind(null, r.id, !r.active)}
                    label={r.active ? t("deactivate") : t("reactivate")}
                    successMessage={t("statusChanged")}
                  />
                </div>
              ),
            },
          ]}
        />
        <Card className="content-start">
          <CardHeader>
            <CardTitle>{editing ? t("formEdit") : t("formNew")}</CardTitle>
          </CardHeader>
          <CardContent>
            <StaffForm
              key={editing?.id ?? "new"}
              branches={ctx.branches.map((b) => ({ id: b.id, label: b.name }))}
              members={members.filter((m) => !linked.has(m.id)).map((m) => ({ id: m.id, label: m.label }))}
              allowBusinessWide={role === "owner"}
              defaultBranchId={
                role === "owner" ? (ctx.activeBranchId ?? "") : (ctx.activeBranchId ?? ctx.branches[0]?.id ?? "")
              }
              initial={
                editing
                  ? {
                      id: editing.id,
                      fullName: editing.full_name,
                      phone: editing.phone ?? "",
                      skill: editing.skill ?? "",
                      branchId: editing.branch_id ?? "",
                      memberId: editing.member_id ?? "",
                      dayRate: editing.day_rate_paise !== null ? toRupees(editing.day_rate_paise) : "",
                      notes: editing.notes ?? "",
                    }
                  : undefined
              }
            />
            <p className="text-muted-foreground mt-4 text-xs">{t("artistHint")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
