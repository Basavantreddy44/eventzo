import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { AppLocale } from "@/i18n/routing";
import type { PolicyType } from "./lib/policies";

export const POLICIES_TAG = "policies";

/** The policy in force for a language (English fallback). Public data, cached. */
export async function getCurrentPolicy(type: PolicyType, locale: AppLocale) {
  "use cache";
  cacheLife("hours");
  cacheTag(POLICIES_TAG);
  const { data, error } = await createPublicClient().rpc("current_policy", { p_type: type, p_locale: locale });
  if (error) throw new Error(`current_policy failed: ${error.message}`);
  return data?.[0] ?? null;
}
