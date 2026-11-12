import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Cookie-less anon client for PUBLIC reference data (categories, cities).
 * It never carries a user session, so it is safe to use inside `"use cache"`
 * scopes. Results are exactly what an anonymous visitor may see under RLS.
 */
export function createPublicClient() {
  const env = getPublicEnv();
  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
