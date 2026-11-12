import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Service-role client. BYPASSES RLS — server-only, never import from client
 * code (enforced by `server-only`). Use only for trusted system operations
 * (webhooks, scheduled jobs, test setup), and always re-check authorisation
 * yourself before using it on behalf of a user.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (server-only). See README → Credentials.");
  }
  return createSupabaseClient<Database>(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
