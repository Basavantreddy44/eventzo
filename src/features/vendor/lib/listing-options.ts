import "server-only";

import { getActiveCities, getAreas, getServiceCategories, localizedName } from "@/features/taxonomy/queries";
import type { VendorContext } from "@/features/organizations/queries/vendor-context";

/** Select options for the listing editor (categories grouped by business category). */
export async function getListingFormOptions(ctx: VendorContext, locale: string) {
  const [categories, cities, areas] = await Promise.all([getServiceCategories(), getActiveCities(), getAreas()]);
  return {
    categories: categories.map((c) => ({
      id: c.id,
      label: localizedName(c, locale),
      businessSlug: c.business_slug,
      group: localizedName({ name: c.business_name, name_i18n: c.business_name_i18n }, locale),
    })),
    cities: cities.map((c) => ({ id: c.id, label: localizedName(c, locale) })),
    areas: areas.map((a) => ({ id: a.id, cityId: a.city_id, label: localizedName(a, locale) })),
    branches: ctx.branches.map((b) => ({ id: b.id, label: b.name })),
  };
}
