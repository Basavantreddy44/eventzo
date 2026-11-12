import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { ListingDetail, ListingSummary } from "@/types/database";
import { PAGE_SIZE, type SearchFilters } from "../lib/search-params";

export const LISTINGS_TAG = "listings";

/**
 * Public discovery. Goes through the `search_listings` RPC, which only returns
 * published services of active vendors (see migration 20261111000100).
 * Cached briefly; vendor edits (Phase 3) call updateTag("listings").
 */
export async function searchListings(filters: SearchFilters): Promise<{ rows: ListingSummary[]; total: number }> {
  "use cache";
  cacheLife("minutes");
  cacheTag(LISTINGS_TAG);

  const { data, error } = await createPublicClient().rpc("search_listings", {
    p_query: filters.q,
    p_city: filters.city,
    p_category: filters.category,
    p_service_category: filters.service,
    p_guests: filters.guests,
    p_max_price_paise: filters.maxPricePaise,
    p_sort: filters.sort,
    p_limit: PAGE_SIZE,
    p_offset: (filters.page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error(`search_listings failed: ${error.message}`);
  const rows = data ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0) };
}

export async function getListing(slug: string): Promise<ListingDetail | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(LISTINGS_TAG, `listing:${slug}`);

  const { data, error } = await createPublicClient().rpc("get_listing", { p_slug: slug });
  if (error) throw new Error(`get_listing failed: ${error.message}`);
  return (data as unknown as ListingDetail | null) ?? null;
}
