import type { BudgetUnit } from "@/types/database";

/** An admin-entered price range for one category in one city (paise). */
export type Benchmark = {
  categorySlug: string;
  unit: BudgetUnit;
  lowPaise: number;
  highPaise: number;
};

export type EstimateLine = {
  categorySlug: string;
  unit: BudgetUnit | null;
  lowPaise: number;
  highPaise: number;
  available: boolean;
};

export type Estimate = {
  lines: EstimateLine[];
  totalLowPaise: number;
  totalHighPaise: number;
  /** Selected categories with no published range for this city. */
  missing: string[];
};

export const MAX_GUESTS = 100_000;

/**
 * Rough budget (enhancement F): per-guest ranges × guests, plus per-event
 * ranges, summed per selected category. Pure and deterministic; the inputs are
 * published `budget_benchmarks` rows for the chosen city.
 */
export function estimateBudget(input: { guests: number; categories: string[]; benchmarks: Benchmark[] }): Estimate {
  const guests = Math.min(Math.max(Math.floor(input.guests), 1), MAX_GUESTS);
  const byCategory = new Map(input.benchmarks.map((b) => [b.categorySlug, b]));
  const unique = [...new Set(input.categories)];

  const lines: EstimateLine[] = unique.map((slug) => {
    const b = byCategory.get(slug);
    if (!b) return { categorySlug: slug, unit: null, lowPaise: 0, highPaise: 0, available: false };
    const factor = b.unit === "per_guest" ? guests : 1;
    return {
      categorySlug: slug,
      unit: b.unit,
      lowPaise: b.lowPaise * factor,
      highPaise: b.highPaise * factor,
      available: true,
    };
  });

  const available = lines.filter((l) => l.available);
  return {
    lines,
    totalLowPaise: available.reduce((sum, l) => sum + l.lowPaise, 0),
    totalHighPaise: available.reduce((sum, l) => sum + l.highPaise, 0),
    missing: lines.filter((l) => !l.available).map((l) => l.categorySlug),
  };
}
