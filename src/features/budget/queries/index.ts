import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { BudgetUnit } from "@/types/database";

export const PRICING_TAG = "pricing";

export type PublishedBenchmark = {
  categorySlug: string;
  citySlug: string;
  unit: BudgetUnit;
  lowPaise: number;
  highPaise: number;
};

/** All published estimator ranges (small table; filtered by city in the caller). */
export async function getPublishedBenchmarks(): Promise<PublishedBenchmark[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRICING_TAG);

  const { data, error } = await createPublicClient()
    .from("budget_benchmarks")
    .select("unit, low_paise, high_paise, business_categories(slug), cities(slug)")
    .eq("is_published", true);
  if (error) throw new Error(`Failed to load price ranges: ${error.message}`);

  return (data ?? []).flatMap((row) =>
    row.business_categories && row.cities
      ? [
          {
            categorySlug: row.business_categories.slug,
            citySlug: row.cities.slug,
            unit: row.unit,
            lowPaise: Number(row.low_paise),
            highPaise: Number(row.high_paise),
          },
        ]
      : [],
  );
}
