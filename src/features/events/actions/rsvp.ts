"use server";

import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { rsvpSchema, type RsvpInput } from "../schemas";

/** Public: a guest answers from their private link. No login; the token is the credential. */
export async function respondRsvp(input: RsvpInput): Promise<ActionResult> {
  const parsed = rsvpSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_rsvp", {
    p_token: v.token,
    p_status: v.status,
    p_count: v.status === "declined" ? 0 : v.count,
    p_note: v.note || (null as unknown as string),
  });
  if (error) {
    if (error.code === "22023" && /closed/i.test(error.message)) return fail("rsvp.closed");
    if (error.code === "22023") return fail("errors.invalidInput", { count: "validation.rsvpCount" });
    return fail(`errors.${mapDbError(error)}`);
  }
  return ok(undefined);
}
