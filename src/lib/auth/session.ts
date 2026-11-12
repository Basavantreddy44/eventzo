import "server-only";

import { cache } from "react";
import { connection } from "next/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppLocale } from "@/i18n/routing";
import type { MyAccess } from "@/types/database";

export type CurrentUser = {
  id: string;
  email: string | null;
  access: MyAccess;
};

/**
 * Data Access Layer entry point. Verifies the session JWT (getClaims) and
 * loads roles/permissions/memberships in one RPC. Memoised per request.
 * Returns null when signed out.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // The session is per request, and getClaims() compares token expiry with the
  // current time; tell Cache Components this is request-time work.
  await connection();
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const sub = claimsData?.claims?.sub;
  if (claimsError || typeof sub !== "string") return null;

  const { data: access, error } = await supabase.rpc("my_access");
  if (error) throw new Error(`Could not load access for current user: ${error.message}`);
  if (!access) return null;

  const email = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email : null;
  // my_access() returns jsonb; its shape is defined in SQL (see MyAccess).
  return { id: sub, email, access: access as unknown as MyAccess };
});

/** Redirects to the localised login page (keeping `next`) when signed out. */
export async function requireUser(locale: AppLocale, nextPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: { pathname: "/login", query: { next: nextPath } }, locale });
  }
  return user!;
}
