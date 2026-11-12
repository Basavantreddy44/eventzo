"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { normalizePhone, profileSchema, type ProfileInput } from "../schemas";

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));

  const user = await getCurrentUser();
  if (!user) return fail("errors.unauthenticated");

  const { fullName, displayName, phone, preferredLocale } = parsed.data;
  const supabase = await createClient();
  // RLS restricts this to the caller's own row; column grants restrict the fields.
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      display_name: displayName || null,
      phone: phone ? normalizePhone(phone) : null,
      preferred_locale: preferredLocale,
    })
    .eq("id", user.id);

  if (error) {
    // Unique phone index → someone else already uses this number.
    if (error.code === "23505") return fail("errors.invalidInput", { phone: "validation.phone" });
    return fail(`errors.${mapDbError(error)}`);
  }
  return ok(undefined);
}
