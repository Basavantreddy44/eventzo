"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { MUHURTHAM_TAG } from "../queries";
import { auspiciousDateFormSchema, toAuspiciousDateRow, type AuspiciousDateFormInput } from "../schemas";

type Auth = { ok: true; user: CurrentUser } | { ok: false; result: ActionResult };

async function authorise(): Promise<Auth> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, result: fail("errors.unauthenticated") };
  if (!hasPermission(user.access, "auspicious_dates.manage")) return { ok: false, result: fail("errors.forbidden") };
  return { ok: true, user };
}

/** Create or update an auspicious date (RLS re-checks the permission; changes are audited). */
export async function saveAuspiciousDate(input: AuspiciousDateFormInput): Promise<ActionResult> {
  const parsed = auspiciousDateFormSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const auth = await authorise();
  if (!auth.ok) return auth.result;

  const supabase = await createClient();
  const row = toAuspiciousDateRow(parsed.data);
  const { error } = parsed.data.id
    ? await supabase.from("auspicious_dates").update(row).eq("id", parsed.data.id)
    : await supabase.from("auspicious_dates").insert({ ...row, created_by: auth.user.id });

  if (error) return error.code === "23505" ? fail("admin.muhurtham.duplicate") : fail(`errors.${mapDbError(error)}`);
  updateTag(MUHURTHAM_TAG);
  return ok(undefined);
}

export async function deleteAuspiciousDate(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return fail("errors.invalidInput");
  const auth = await authorise();
  if (!auth.ok) return auth.result;

  const supabase = await createClient();
  const { error } = await supabase.from("auspicious_dates").delete().eq("id", id);
  if (error) return fail(`errors.${mapDbError(error)}`);
  updateTag(MUHURTHAM_TAG);
  return ok(undefined);
}
