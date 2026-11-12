import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Grid2x2, Pencil } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { cn } from "@/lib/utils";
import { localeFrom } from "@/i18n/params";
import { setTaxonomyActive } from "@/features/admin/actions";
import { AreaForm, CategoryForm, CityForm, ServiceCategoryForm } from "@/features/admin/components/taxonomy-forms";
import { NoPermission } from "@/features/admin/components/no-permission";
import { loadAdminPage } from "@/features/admin/lib/page";
import { listTaxonomy } from "@/features/admin/queries";
import { TAXONOMY_KINDS, type TaxonomyKind } from "@/features/admin/schemas";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/taxonomy">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "admin.taxonomy" });
  return { title: t("title"), robots: { index: false } };
}

const i18nOf = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, string>) : {});

export default async function AdminTaxonomyPage({ params, searchParams }: PageProps<"/[locale]/admin/taxonomy">) {
  const { allowed } = await loadAdminPage(params, "/admin/taxonomy", "taxonomy.manage");
  const t = await getTranslations("admin.taxonomy");
  if (!allowed) return <NoPermission title={t("title")} />;

  const sp = await searchParams;
  const tab: TaxonomyKind = (TAXONOMY_KINDS as readonly string[]).includes(String(sp.tab))
    ? (sp.tab as TaxonomyKind)
    : "categories";
  const edit = typeof sp.edit === "string" ? sp.edit : undefined;
  const parent = typeof sp.parent === "string" ? sp.parent : undefined;
  const data = await listTaxonomy();
  const categoryName = new Map(data.categories.map((c) => [c.id, c.name]));
  const cityName = new Map(data.cities.map((c) => [c.id, c.name]));

  const editLink = (id: string) => (
    <Button asChild variant="ghost" size="sm">
      <Link href={{ pathname: "/admin/taxonomy", query: { tab, edit: id, ...(parent ? { parent } : {}) } }}>
        <Pencil aria-hidden />
        {t("edit")}
      </Link>
    </Button>
  );
  const toggle = (id: string, active: boolean) => (
    <ActionButton
      action={setTaxonomyActive.bind(null, tab, id, !active)}
      label={active ? t("hide") : t("show")}
      successMessage={t("saved")}
    />
  );
  const actions = (r: { id: string; active: boolean }) => (
    <div className="flex justify-end gap-1">
      {editLink(r.id)}
      {toggle(r.id, r.active)}
    </div>
  );
  const status = (active: boolean) => <StatusBadge status={active ? "active" : "hidden"} />;

  let table: React.ReactNode = null;
  let form: React.ReactNode = null;
  let formTitle = "";

  if (tab === "categories") {
    const editing = data.categories.find((c) => c.id === edit);
    formTitle = editing ? t("editCategory") : t("newCategory");
    table = (
      <DataTable
        rows={data.categories}
        rowKey={(r) => r.id}
        caption={t("tabs.categories")}
        empty={<EmptyState icon={Grid2x2} title={t("empty")} />}
        columns={[
          {
            key: "n",
            header: t("name"),
            cell: (r) => (
              <div className="grid gap-0.5">
                <span className="font-medium">
                  {r.name}
                  {r.is_launch_focus ? <span className="text-gold ml-1 text-xs">★</span> : null}
                </span>
                <span className="text-muted-foreground text-xs">
                  {r.slug}
                  {" · "}
                  <Link
                    href={{ pathname: "/admin/taxonomy", query: { tab: "services", parent: r.id } }}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {t("serviceCount", { count: data.services.filter((s) => s.business_category_id === r.id).length })}
                  </Link>
                </span>
              </div>
            ),
          },
          { key: "o", header: t("order"), cell: (r) => r.display_order, hideOnMobile: true },
          { key: "s", header: t("status"), cell: (r) => status(r.active) },
          { key: "a", header: "", className: "text-right", cell: actions },
        ]}
      />
    );
    form = (
      <CategoryForm
        key={editing?.id ?? "new"}
        initial={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                slug: editing.slug as string,
                nameKn: i18nOf(editing.name_i18n).kn ?? "",
                nameHi: i18nOf(editing.name_i18n).hi ?? "",
                description: editing.description ?? "",
                icon: editing.icon ?? "",
                displayOrder: String(editing.display_order),
                isLaunchFocus: editing.is_launch_focus,
              }
            : undefined
        }
      />
    );
  } else if (tab === "services") {
    const rows = parent ? data.services.filter((s) => s.business_category_id === parent) : data.services;
    const editing = data.services.find((c) => c.id === edit);
    formTitle = editing ? t("editService") : t("newService");
    table = (
      <div className="grid gap-3">
        {parent ? (
          <p className="text-sm">
            {t("filteredBy", { name: categoryName.get(parent) ?? "" })}{" "}
            <Link
              href={{ pathname: "/admin/taxonomy", query: { tab: "services" } }}
              className="text-primary underline-offset-4 hover:underline"
            >
              {t("showAll")}
            </Link>
          </p>
        ) : null}
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          caption={t("tabs.services")}
          empty={<EmptyState icon={Grid2x2} title={t("empty")} />}
          columns={[
            {
              key: "n",
              header: t("name"),
              cell: (r) => (
                <div className="grid gap-0.5">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {categoryName.get(r.business_category_id)} · {r.slug}
                  </span>
                </div>
              ),
            },
            {
              key: "m",
              header: t("bookingMode"),
              cell: (r) => t(`modes.${r.default_booking_mode}`),
              hideOnMobile: true,
            },
            { key: "s", header: t("status"), cell: (r) => status(r.active) },
            { key: "a", header: "", className: "text-right", cell: actions },
          ]}
        />
      </div>
    );
    form = (
      <ServiceCategoryForm
        key={editing?.id ?? `new-${parent ?? ""}`}
        categories={data.categories
          .filter((c) => c.active || c.id === editing?.business_category_id)
          .sort((a, b) => (a.id === parent ? -1 : b.id === parent ? 1 : 0))
          .map((c) => ({ id: c.id, label: c.name }))}
        initial={
          editing
            ? {
                id: editing.id,
                businessCategoryId: editing.business_category_id,
                name: editing.name,
                slug: editing.slug as string,
                nameKn: i18nOf(editing.name_i18n).kn ?? "",
                nameHi: i18nOf(editing.name_i18n).hi ?? "",
                description: editing.description ?? "",
                defaultBookingMode: editing.default_booking_mode,
                resourceKindHint: editing.resource_kind_hint ?? "",
                displayOrder: String(editing.display_order),
              }
            : undefined
        }
      />
    );
  } else if (tab === "cities") {
    const editing = data.cities.find((c) => c.id === edit);
    formTitle = editing ? t("editCity") : t("newCity");
    table = (
      <DataTable
        rows={data.cities}
        rowKey={(r) => r.id}
        caption={t("tabs.cities")}
        empty={<EmptyState icon={Grid2x2} title={t("empty")} />}
        columns={[
          {
            key: "n",
            header: t("name"),
            cell: (r) => (
              <div className="grid gap-0.5">
                <span className="font-medium">
                  {r.name}
                  {r.is_launch_city ? <span className="text-gold ml-1 text-xs">★</span> : null}
                </span>
                <span className="text-muted-foreground text-xs">
                  {r.state} · {r.slug}
                  {r.alt_names.length ? ` · ${r.alt_names.join(", ")}` : ""}
                </span>
              </div>
            ),
          },
          {
            key: "ar",
            header: t("tabs.areas"),
            cell: (r) => data.areas.filter((a) => a.city_id === r.id).length,
            hideOnMobile: true,
          },
          { key: "s", header: t("status"), cell: (r) => status(r.active) },
          { key: "a", header: "", className: "text-right", cell: actions },
        ]}
      />
    );
    form = (
      <CityForm
        key={editing?.id ?? "new"}
        initial={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                slug: editing.slug as string,
                nameKn: i18nOf(editing.name_i18n).kn ?? "",
                nameHi: i18nOf(editing.name_i18n).hi ?? "",
                state: editing.state,
                stateCode: editing.state_code,
                altNames: editing.alt_names.join(", "),
                isLaunchCity: editing.is_launch_city,
              }
            : undefined
        }
      />
    );
  } else {
    const editing = data.areas.find((c) => c.id === edit);
    formTitle = editing ? t("editArea") : t("newArea");
    table = (
      <DataTable
        rows={data.areas}
        rowKey={(r) => r.id}
        caption={t("tabs.areas")}
        empty={<EmptyState icon={Grid2x2} title={t("empty")} />}
        columns={[
          {
            key: "n",
            header: t("name"),
            cell: (r) => (
              <div className="grid gap-0.5">
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground text-xs">
                  {cityName.get(r.city_id)}
                  {r.pincode ? ` · ${r.pincode}` : ""}
                </span>
              </div>
            ),
          },
          { key: "s", header: t("status"), cell: (r) => status(r.active) },
          { key: "a", header: "", className: "text-right", cell: actions },
        ]}
      />
    );
    form = (
      <AreaForm
        key={editing?.id ?? "new"}
        cities={data.cities
          .filter((c) => c.active || c.id === editing?.city_id)
          .map((c) => ({ id: c.id, label: c.name }))}
        initial={
          editing
            ? {
                id: editing.id,
                cityId: editing.city_id,
                name: editing.name,
                slug: editing.slug as string,
                nameKn: i18nOf(editing.name_i18n).kn ?? "",
                nameHi: i18nOf(editing.name_i18n).hi ?? "",
                pincode: editing.pincode ?? "",
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <nav aria-label={t("sections")} className="flex gap-1 overflow-x-auto border-b">
        {TAXONOMY_KINDS.map((name) => (
          <Link
            key={name}
            href={{ pathname: "/admin/taxonomy", query: { tab: name } }}
            aria-current={tab === name ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              tab === name
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
            data-testid={`taxonomy-tab-${name}`}
          >
            {t(`tabs.${name}`)}
          </Link>
        ))}
      </nav>
      <p className="text-muted-foreground -mt-3 text-xs">{t("hideHint")}</p>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">{table}</div>
        <Card className="content-start">
          <CardHeader>
            <CardTitle>{formTitle}</CardTitle>
          </CardHeader>
          <CardContent>{form}</CardContent>
        </Card>
      </div>
    </div>
  );
}
