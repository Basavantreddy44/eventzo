import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Calculator, Pencil } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { DeleteRowButton } from "@/components/delete-row-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatPaise } from "@/lib/money";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { localizedPath } from "@/lib/auth/portal-user";
import { createClient } from "@/lib/supabase/server";
import { localeFrom } from "@/i18n/params";
import { deleteBenchmark } from "@/features/budget/actions/admin";
import { BenchmarkForm } from "@/features/budget/components/benchmark-form";
import { getActiveCities, getBusinessCategories, localizedName } from "@/features/taxonomy/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/pricing">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "admin.pricing" });
  return { title: t("title"), robots: { index: false } };
}

const toRupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

export default async function AdminPricingPage({ params, searchParams }: PageProps<"/[locale]/admin/pricing">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/admin/pricing"));
  const t = await getTranslations("admin.pricing");
  const tAdmin = await getTranslations("admin.dashboard");

  if (!hasPermission(user.access, "pricing.manage")) {
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
  const [{ data, error }, categories, cities, sp] = await Promise.all([
    supabase
      .from("budget_benchmarks")
      .select("id, business_category_id, city_id, unit, low_paise, high_paise, notes, source, is_published")
      .order("city_id")
      .order("business_category_id"),
    getBusinessCategories(),
    getActiveCities(),
    searchParams,
  ]);
  if (error) throw new Error(`Failed to load price ranges: ${error.message}`);

  const rows = data ?? [];
  const categoryName = new Map(categories.map((c) => [c.id, localizedName(c, locale)]));
  const cityName = new Map(cities.map((c) => [c.id, localizedName(c, locale)]));
  const editId = typeof sp.edit === "string" ? sp.edit : undefined;
  const editing = rows.find((r) => r.id === editId);
  const money = (p: number) => formatPaise(BigInt(p));
  type Row = (typeof rows)[number];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.id}
          caption={t("title")}
          empty={<EmptyState icon={Calculator} title={t("empty")} />}
          columns={[
            {
              key: "category",
              header: t("category"),
              cell: (r) => <span className="font-medium">{categoryName.get(r.business_category_id) ?? "—"}</span>,
            },
            { key: "city", header: t("city"), cell: (r) => cityName.get(r.city_id) ?? "—" },
            {
              key: "range",
              header: t("range"),
              cell: (r) => (
                <span className="tabular-nums">
                  {money(r.low_paise)} – {money(r.high_paise)}{" "}
                  <span className="text-muted-foreground text-xs">{t(`unitOptions.${r.unit}`)}</span>
                </span>
              ),
            },
            {
              key: "status",
              header: t("status"),
              cell: (r) => <StatusBadge status={r.is_published ? "active" : "draft"} />,
              hideOnMobile: true,
            },
            {
              key: "actions",
              header: "",
              className: "text-right",
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={{ pathname: "/admin/pricing", query: { edit: r.id } }}>
                      <Pencil aria-hidden />
                      {t("edit")}
                    </Link>
                  </Button>
                  <DeleteRowButton
                    action={deleteBenchmark.bind(null, r.id)}
                    label={t("delete")}
                    title={t("deleteTitle")}
                    description={t("deleteBody")}
                    successMessage={t("deleted")}
                  />
                </div>
              ),
            },
          ]}
        />
        <Card className="content-start">
          <CardHeader>
            <CardTitle>{editing ? t("formTitleEdit") : t("formTitleNew")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BenchmarkForm
              key={editing?.id ?? "new"}
              categories={categories.map((c) => ({ id: c.id, label: localizedName(c, locale) }))}
              cities={cities.map((c) => ({ id: c.id, label: localizedName(c, locale) }))}
              initial={
                editing
                  ? {
                      id: editing.id,
                      businessCategoryId: editing.business_category_id,
                      cityId: editing.city_id,
                      unit: editing.unit,
                      low: toRupees(editing.low_paise),
                      high: toRupees(editing.high_paise),
                      notes: editing.notes ?? "",
                      source: editing.source ?? "",
                      isPublished: editing.is_published,
                    }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
