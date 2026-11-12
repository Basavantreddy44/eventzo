import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** The caller's own profile (RLS: id = auth.uid()). */
export const getMyProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, display_name, phone, phone_verified_at, preferred_locale, timezone")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load profile: ${error.message}`);
  return data;
});
