import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getPublicEnv } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";
import { LISTINGS_TAG } from "@/features/discovery/queries";

const PAGE = 50; // search_listings() returns at most 50 per call
const MAX_LISTINGS = 5000;

/** Live listing slugs, exactly as an anonymous visitor can find them. */
async function liveListingSlugs(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(LISTINGS_TAG);
  const supabase = createPublicClient();
  const slugs: string[] = [];
  for (let offset = 0; offset < MAX_LISTINGS; offset += PAGE) {
    const { data, error } = await supabase.rpc("search_listings", { p_limit: PAGE, p_offset: offset });
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    slugs.push(...data.map((r) => r.slug));
    if (data.length < PAGE) break;
  }
  return slugs;
}

/** Public pages in English, with Kannada and Hindi alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getPublicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const entry = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${site}${path}`,
    priority,
    alternates: { languages: { en: `${site}${path}`, kn: `${site}/kn${path}`, hi: `${site}/hi${path}` } },
  });
  let listings: string[] = [];
  try {
    listings = await liveListingSlugs();
  } catch (e) {
    // Database unreachable at build/request time: still serve the static pages.
    console.error("sitemap: could not load listings", e);
  }
  return [
    entry("", 1),
    entry("/search", 0.9),
    entry("/muhurtham", 0.6),
    entry("/budget-estimator", 0.6),
    entry("/become-a-vendor", 0.5),
    ...listings.map((slug) => entry(`/listings/${slug}`, 0.8)),
  ];
}
