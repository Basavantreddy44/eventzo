"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { PRICING_TAG } from "../queries";
import { benchmarkFormSchema, toBenchmarkRow, type BenchmarkFormInput } from "../schemas";

type Auth = { ok: true; user: CurrentUser } | { ok: false; result: ActionResult };

async function authorise(): Promise<Auth> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, result: fail("errors.unauthenticated") };
  if (!hasPermission(user.access, "pricing.manage")) return { ok: false, result: fail("errors.forbidden") };
  return { ok: true, user };
}

/** Create or update an estimator price range (RLS re-checks pricing.manage; changes are audited). */
export async function saveBenchmark(input: BenchmarkFormInput): Promise<ActionResult> {
  const parsed = benchmarkFormSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const auth = await authorise();
  if (!auth.ok) return auth.result;

  const supabase = await createClient();
  const row = { ...toBenchmarkRow(parsed.data), updated_by: auth.user.id };
  const { error } = parsed.data.id
    ? await supabase.from("budget_benchmarks").update(row).eq("id", parsed.data.id)
    : await supabase.from("budget_benchmarks").insert(row);

  if (error) return error.code === "23505" ? fail("admin.pricing.duplicate") : fail(`errors.${mapDbError(error)}`);
  updateTag(PRICING_TAG);
  return ok(undefined);
}

export async function deleteBenchmark(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return fail("errors.invalidInput");
  const auth = await authorise();
  if (!auth.ok) return auth.result;

  const supabase = await createClient();
  const { error } = await supabase.from("budget_benchmarks").delete().eq("id", id);
  if (error) return fail(`errors.${mapDbError(error)}`);
  updateTag(PRICING_TAG);
  return ok(undefined);
}
