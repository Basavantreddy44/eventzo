import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { Json } from "@/types/database";

export const MUHURTHAM_TAG = "muhurtham";

export type MuhurthamWindow = { start: string; end: string; label?: string };

export type PublicAuspiciousDate = {
  id: string;
  date: string;
  title: string;
  title_i18n: Json;
  notes: string | null;
  significance: number;
  windows: MuhurthamWindow[];
  /** null = applies to every city */
  city_id: string | null;
};

function parseWindows(value: Json): MuhurthamWindow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((w) =>
    w && typeof w === "object" && !Array.isArray(w) && typeof w.start === "string" && typeof w.end === "string"
      ? [{ start: w.start, end: w.end, label: typeof w.label === "string" ? w.label : undefined }]
      : [],
  );
}

/**
 * Published auspicious dates in [from, to] (enhancement B). RLS limits the
 * anon client to published rows. City filtering happens in the caller: a
 * date with no city applies everywhere.
 */
export async function getAuspiciousDates(from: string, to: string): Promise<PublicAuspiciousDate[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(MUHURTHAM_TAG);

  const { data, error } = await createPublicClient()
    .from("auspicious_dates")
    .select("id, date, title, title_i18n, notes, significance, muhurtham_windows, city_id")
    .eq("is_published", true)
    .gte("date", from)
    .lte("date", to)
    .order("date");
  if (error) throw new Error(`Failed to load auspicious dates: ${error.message}`);

  return (data ?? []).map((d) => ({
    id: d.id,
    date: d.date,
    title: d.title,
    title_i18n: d.title_i18n,
    notes: d.notes,
    significance: d.significance,
    windows: parseWindows(d.muhurtham_windows),
    city_id: d.city_id,
  }));
}

/** Keeps dates that apply to the city (or every date when no city is chosen). */
export function forCity<T extends { city_id: string | null }>(dates: T[], cityId: string | null): T[] {
  return cityId ? dates.filter((d) => d.city_id === null || d.city_id === cityId) : dates;
}

export function significanceKey(significance: number): "low" | "medium" | "high" {
  return significance >= 3 ? "high" : significance === 2 ? "medium" : "low";
}
