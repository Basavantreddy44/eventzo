import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { BusinessCategoryRow, CityRow } from "@/types/database";

export const TAXONOMY_CACHE_TAG = "taxonomy";

export type CategorySummary = Pick<
  BusinessCategoryRow,
  "id" | "slug" | "name" | "name_i18n" | "description" | "icon" | "display_order" | "is_launch_focus"
>;
export type CitySummary = Pick<CityRow, "id" | "slug" | "name" | "name_i18n" | "state">;

/**
 * Public, rarely-changing reference data. Cached on the server for hours and
 * invalidated with `revalidateTag("taxonomy")` when admins edit categories
 * (Phase 8). Uses the cookie-less anon client, so the cache never holds
 * anything user-specific.
 */
export async function getBusinessCategories(): Promise<CategorySummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAXONOMY_CACHE_TAG);

  const { data, error } = await createPublicClient()
    .from("business_categories")
    .select("id, slug, name, name_i18n, description, icon, display_order, is_launch_focus")
    .eq("active", true)
    .order("display_order");
  if (error) throw new Error(`Failed to load categories: ${error.message}`);
  return data ?? [];
}

export async function getActiveCities(): Promise<CitySummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAXONOMY_CACHE_TAG);

  const { data, error } = await createPublicClient()
    .from("cities")
    .select("id, slug, name, name_i18n, state")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(`Failed to load cities: ${error.message}`);
  return data ?? [];
}

/** Picks the translated name for a locale, falling back to the base name. */
export function localizedName(row: { name: string; name_i18n: unknown }, locale: string): string {
  const i18n = row.name_i18n;
  if (i18n && typeof i18n === "object" && !Array.isArray(i18n)) {
    const value = (i18n as Record<string, unknown>)[locale];
    if (typeof value === "string" && value.trim()) return value;
  }
  return row.name;
}

export type ServiceCategoryOption = {
  id: string;
  slug: string;
  name: string;
  name_i18n: unknown;
  business_slug: string;
  business_name: string;
  business_name_i18n: unknown;
  resource_kind_hint: string | null;
};

/** Active service categories with their business category (for listing editors). */
export async function getServiceCategories(): Promise<ServiceCategoryOption[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAXONOMY_CACHE_TAG);

  const { data, error } = await createPublicClient()
    .from("service_categories")
    .select(
      "id, slug, name, name_i18n, resource_kind_hint, display_order, business_categories(slug, name, name_i18n, display_order)",
    )
    .eq("active", true)
    .order("display_order");
  if (error) throw new Error(`Failed to load service categories: ${error.message}`);

  return (
    (data ?? [])
      .flatMap((s) =>
        s.business_categories
          ? [
              {
                id: s.id,
                slug: s.slug,
                name: s.name,
                name_i18n: s.name_i18n,
                business_slug: s.business_categories.slug,
                business_name: s.business_categories.name,
                business_name_i18n: s.business_categories.name_i18n,
                resource_kind_hint: s.resource_kind_hint,
                order: s.business_categories.display_order * 1000 + s.display_order,
              },
            ]
          : [],
      )
      .sort((a, b) => a.order - b.order)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop the sort key
      .map(({ order, ...rest }) => rest)
  );
}

export type AreaOption = { id: string; city_id: string; slug: string; name: string; name_i18n: unknown };

export async function getAreas(): Promise<AreaOption[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAXONOMY_CACHE_TAG);

  const { data, error } = await createPublicClient()
    .from("areas")
    .select("id, city_id, slug, name, name_i18n")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(`Failed to load areas: ${error.message}`);
  return data ?? [];
}
