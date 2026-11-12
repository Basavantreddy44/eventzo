import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Package, Pencil } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { localeFrom } from "@/i18n/params";
import { setResourceActive } from "@/features/vendor/actions/resources";
import { ResourceForm } from "@/features/vendor/components/resource-form";
import { loadVendorPage } from "@/features/vendor/lib/page";
import { getListings, getResources } from "@/features/vendor/queries";
import { listStaff } from "@/features/staff/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/resources">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendor.resources" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VendorResourcesPage({ params, searchParams }: PageProps<"/[locale]/vendor/resources">) {
  const { ctx } = await loadVendorPage(params, "/vendor/resources");
  if (!ctx) return null;
  const orgId = ctx.membership.organization_id;
  const [t, resources, listings, sp, staff] = await Promise.all([
    getTranslations("vendor.resources"),
    getResources(orgId),
    getListings(orgId, null),
    searchParams,
    ctx.membership.role === "staff" ? Promise.resolve([]) : listStaff(orgId),
  ]);
  const staffName = new Map(staff.map((s) => [s.id, s.full_name]));
  const linkedStaff = new Set(resources.filter((r) => r.staff_profile_id).map((r) => r.staff_profile_id));
  const canEdit = ctx.membership.role !== "staff";
  const branchName = new Map(ctx.branches.map((b) => [b.id, b.name]));
  const editing = resources.find((r) => r.id === sp.edit);
  type Row = (typeof resources)[number];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <DataTable<Row>
          rows={resources}
          rowKey={(r) => r.id}
          caption={t("title")}
          empty={<EmptyState icon={Package} title={t("empty")} />}
          columns={[
            {
              key: "name",
              header: t("colName"),
              cell: (r) => (
                <div className="grid gap-0.5">
                  <span className="font-medium">{r.name}</span>
                  {r.branch_id || r.staff_profile_id ? (
                    <span className="text-muted-foreground text-xs">
                      {[
                        r.branch_id ? branchName.get(r.branch_id) : null,
                        r.staff_profile_id ? staffName.get(r.staff_profile_id) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </div>
              ),
            },
            { key: "kind", header: t("colKind"), cell: (r) => t(`kinds.${r.kind}`), hideOnMobile: true },
            {
              key: "capacity",
              header: t("colCapacity"),
              cell: (r) => (r.allocation_mode === "capacity" ? r.capacity.toLocaleString("en-IN") : "1"),
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
              cell: (r) =>
                canEdit ? (
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={{ pathname: "/vendor/resources", query: { edit: r.id } }}>
                        <Pencil aria-hidden />
                        {t("edit")}
                      </Link>
                    </Button>
                    <ActionButton
                      action={setResourceActive.bind(null, r.id, !r.active)}
                      label={r.active ? t("deactivate") : t("reactivate")}
                      successMessage={t("statusChanged")}
                    />
                  </div>
                ) : null,
            },
          ]}
        />
        {canEdit ? (
          <Card className="content-start">
            <CardHeader>
              <CardTitle>{editing ? t("formEdit") : t("formNew")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResourceForm
                key={editing?.id ?? "new"}
                services={listings.map((l) => ({ id: l.id, label: l.title }))}
                branches={ctx.branches.map((b) => ({ id: b.id, label: b.name }))}
                staff={staff
                  .filter((s) => s.active && (!linkedStaff.has(s.id) || s.id === editing?.staff_profile_id))
                  .map((s) => ({ id: s.id, label: s.skill ? `${s.full_name} · ${s.skill}` : s.full_name }))}
                defaultBranchId={
                  ctx.activeBranchId ?? (ctx.membership.role === "branch_manager" ? (ctx.branches[0]?.id ?? "") : "")
                }
                initial={
                  editing
                    ? {
                        id: editing.id,
                        name: editing.name,
                        kind: editing.kind,
                        allocationMode: editing.allocation_mode,
                        capacity: String(editing.capacity),
                        serviceId: editing.service_id ?? "",
                        branchId: editing.branch_id ?? "",
                        staffProfileId: editing.staff_profile_id ?? "",
                        setupBufferMin: String(editing.setup_buffer_min),
                        breakdownBufferMin: String(editing.breakdown_buffer_min),
                        travelBufferMin: String(editing.travel_buffer_min),
                      }
                    : undefined
                }
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
