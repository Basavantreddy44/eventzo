import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Building2, Pencil } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { localeFrom } from "@/i18n/params";
import { setBranchActive } from "@/features/vendor/actions/branches";
import { BranchForm } from "@/features/vendor/components/branch-form";
import { loadVendorPage } from "@/features/vendor/lib/page";
import { getBranches } from "@/features/vendor/queries";
import { getActiveCities, getAreas, localizedName } from "@/features/taxonomy/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/branches">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendor.branches" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VendorBranchesPage({ params, searchParams }: PageProps<"/[locale]/vendor/branches">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/branches");
  if (!ctx) return null;
  const [t, branches, cities, areas, sp] = await Promise.all([
    getTranslations("vendor.branches"),
    getBranches(ctx.membership.organization_id),
    getActiveCities(),
    getAreas(),
    searchParams,
  ]);
  const role = ctx.membership.role;
  const isOwner = role === "owner";
  const canEdit = isOwner || role === "branch_manager";
  const cityName = new Map(cities.map((c) => [c.id, localizedName(c, locale)]));
  const areaName = new Map(areas.map((a) => [a.id, localizedName(a, locale)]));
  const editing = branches.find((b) => b.id === sp.edit);
  type Branch = (typeof branches)[number];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {role === "branch_manager" ? <p className="text-muted-foreground text-sm">{t("managerNote")}</p> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <DataTable<Branch>
          rows={branches}
          rowKey={(b) => b.id}
          caption={t("title")}
          empty={<EmptyState icon={Building2} title={t("empty")} />}
          columns={[
            {
              key: "name",
              header: t("colName"),
              cell: (b) => (
                <span className="flex flex-wrap items-center gap-1.5 font-medium">
                  {b.name}
                  {b.is_primary ? <Badge variant="gold">{t("primary")}</Badge> : null}
                </span>
              ),
            },
            {
              key: "location",
              header: t("colLocation"),
              cell: (b) =>
                [b.area_id ? areaName.get(b.area_id) : null, b.city_id ? cityName.get(b.city_id) : null]
                  .filter(Boolean)
                  .join(", ") || "—",
            },
            {
              key: "status",
              header: t("colStatus"),
              cell: (b) => <StatusBadge status={b.active ? "active" : "closed"} />,
              hideOnMobile: true,
            },
            {
              key: "actions",
              header: "",
              className: "text-right",
              cell: (b) =>
                canEdit ? (
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={{ pathname: "/vendor/branches", query: { edit: b.id } }}>
                        <Pencil aria-hidden />
                        {t("edit")}
                      </Link>
                    </Button>
                    {isOwner && !b.is_primary ? (
                      b.active ? (
                        <ActionButton
                          action={setBranchActive.bind(null, b.id, false)}
                          label={t("deactivate")}
                          successMessage={t("statusChanged")}
                          confirm={{ title: t("deactivateTitle"), description: t("deactivateBody"), destructive: true }}
                        />
                      ) : (
                        <ActionButton
                          action={setBranchActive.bind(null, b.id, true)}
                          label={t("reactivate")}
                          successMessage={t("statusChanged")}
                        />
                      )
                    ) : null}
                  </div>
                ) : null,
            },
          ]}
        />
        {isOwner || editing ? (
          <Card className="content-start">
            <CardHeader>
              <CardTitle>{editing ? t("formEdit") : t("formNew")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BranchForm
                key={editing?.id ?? "new"}
                cities={cities.map((c) => ({ id: c.id, label: localizedName(c, locale) }))}
                areas={areas.map((a) => ({ id: a.id, cityId: a.city_id, label: localizedName(a, locale) }))}
                initial={
                  editing
                    ? {
                        id: editing.id,
                        name: editing.name,
                        cityId: editing.city_id ?? "",
                        areaId: editing.area_id ?? "",
                        addressLine1: editing.address_line1 ?? "",
                        addressLine2: editing.address_line2 ?? "",
                        pincode: editing.pincode ?? "",
                        phone: editing.phone ?? "",
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
