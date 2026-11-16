import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

export const REVIEWS_TAG = "reviews";

const REVIEW_FIELDS =
  "id, booking_item_id, service_id, rating, body, photos, status, hidden_reason, vendor_reply, vendor_replied_at, created_at, updated_at";

/** The review of one booking item (customer, the vendor, or a moderator — RLS decides). */
export async function getBookingReview(itemId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("reviews").select(REVIEW_FIELDS).eq("booking_item_id", itemId).maybeSingle();
  return data;
}

/** Public: published reviews and the rating summary of a live listing (cached; review changes update the tag). */
export async function getListingReviews(serviceId: string, limit = 10) {
  "use cache";
  cacheLife("minutes");
  cacheTag(REVIEWS_TAG);
  const supabase = createPublicClient();
  const [reviews, rating] = await Promise.all([
    supabase.rpc("listing_reviews", { p_service_id: serviceId, p_limit: limit }),
    supabase.rpc("listing_rating", { p_service_id: serviceId }),
  ]);
  const summary = rating.data?.[0];
  return {
    reviews: reviews.data ?? [],
    average: summary?.average == null ? null : Number(summary.average),
    total: summary?.total ?? 0,
    stars: summary?.stars ?? [0, 0, 0, 0, 0],
  };
}

/** Moderators: newest reviews first, optionally only hidden ones. */
export async function getReviewsForModeration(status: "all" | "published" | "hidden" = "all", limit = 50) {
  const supabase = await createClient();
  let query = supabase
    .from("reviews")
    .select(`${REVIEW_FIELDS}, services(title, slug), organizations(name)`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status !== "all") query = query.eq("status", status);
  const { data } = await query;
  return data ?? [];
}
