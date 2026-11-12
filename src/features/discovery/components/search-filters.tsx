import Form from "next/form";
import { getLocale, getTranslations } from "next-intl/server";
import { Link, getPathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SORTS, type SearchFilters } from "../lib/search-params";

/** Filter panel. GET form, so the URL is always the source of truth (shareable, back-button friendly). */
export async function SearchFilterPanel({
  filters,
  categories,
}: {
  filters: SearchFilters;
  categories: { slug: string; label: string }[];
}) {
  const t = await getTranslations("search");
  const action = getPathname({ href: "/search", locale: await getLocale() });

  return (
    <Form action={action} className="grid gap-4" aria-label={t("filters")}>
      {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
      {filters.city ? <input type="hidden" name="city" value={filters.city} /> : null}

      <div className="grid gap-2">
        <Label htmlFor="filter-category">{t("category")}</Label>
        <NativeSelect id="filter-category" name="category" defaultValue={filters.category ?? ""}>
          <option value="">{t("anyCategory")}</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="filter-guests">{t("guests")}</Label>
        <Input
          id="filter-guests"
          name="guests"
          type="number"
          inputMode="numeric"
          min={1}
          max={100000}
          defaultValue={filters.guests}
          placeholder={t("guestsPlaceholder")}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="filter-max">{t("maxPrice")}</Label>
        <Input
          id="filter-max"
          name="max"
          inputMode="numeric"
          defaultValue={filters.maxPricePaise ? String(Math.floor(filters.maxPricePaise / 100)) : undefined}
          aria-describedby="filter-max-hint"
        />
        <p id="filter-max-hint" className="text-muted-foreground text-xs">
          {t("maxPriceHint")}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="filter-sort">{t("sort")}</Label>
        <NativeSelect id="filter-sort" name="sort" defaultValue={filters.sort}>
          {SORTS.filter((s) => s !== "relevance" || filters.q).map((s) => (
            <option key={s} value={s}>
              {t(`sortOptions.${s}`)}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">{t("apply")}</Button>
        <Link
          href={filters.city ? { pathname: "/search", query: { city: filters.city } } : "/search"}
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          {t("reset")}
        </Link>
      </div>
    </Form>
  );
}
