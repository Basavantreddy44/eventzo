"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { rupeesToPaise } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { dbFail, requireVendorActor } from "@/features/vendor/lib/actor";
import { expenseSchema, payoutSchema, toExpenseRow, type ExpenseInput, type PayoutInput } from "../schemas";

const MANAGERS = ["owner", "branch_manager"] as const;

/** Owners record any expense; branch managers only for their branches (RLS). */
export async function saveExpense(input: ExpenseInput): Promise<ActionResult> {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const orgId = actor.ctx.membership.organization_id;
  const supabase = await createClient();
  const row = toExpenseRow(parsed.data);

  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("vendor_expenses")
      .update(row)
      .eq("id", parsed.data.id)
      .eq("organization_id", orgId)
      .select("id");
    if (error) return expenseError(error);
    if (!data?.length) return fail("errors.forbidden");
    return ok(undefined);
  }
  const { error } = await supabase.from("vendor_expenses").insert({
    ...row,
    organization_id: orgId,
    created_by: actor.ctx.user.id,
    idempotency_key: parsed.data.idempotencyKey,
  });
  // Same idempotency key = a double submit that already succeeded.
  if (error?.code === "23505") return ok(undefined);
  return error ? expenseError(error) : ok(undefined);
}

function expenseError(error: { code?: string; message?: string }): ActionResult<never> {
  if (error.code === "42501") return fail("finance.branchOnly");
  if (error.code === "22023") return fail("errors.invalidInput", { spentOn: "finance.dateRange" });
  return dbFail(error);
}

export async function deleteExpense(expenseId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(expenseId).success) return fail("errors.invalidInput");
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_expenses")
    .delete()
    .eq("id", expenseId)
    .eq("organization_id", actor.ctx.membership.organization_id)
    .select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("errors.forbidden");
  return ok(undefined);
}

/** Records what a staff member was paid for a job (one payout per assignment). */
export async function recordStaffPayout(input: PayoutInput): Promise<ActionResult> {
  const parsed = payoutSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const v = parsed.data;
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();

  const { data: a, error: aErr } = await supabase
    .from("job_assignments")
    .select("id, staff_profiles(full_name)")
    .eq("id", v.assignmentId)
    .maybeSingle();
  if (aErr) return dbFail(aErr);
  if (!a) return fail("errors.notFound");

  const { error } = await supabase.from("vendor_expenses").insert({
    organization_id: actor.ctx.membership.organization_id,
    category: "staff_payout",
    amount_paise: Number(rupeesToPaise(v.amount)),
    spent_on: v.spentOn,
    payee: (a.staff_profiles as { full_name: string } | null)?.full_name ?? null,
    mode: v.mode,
    reference: v.reference || null,
    assignment_id: v.assignmentId,
    created_by: actor.ctx.user.id,
    idempotency_key: v.idempotencyKey,
  });
  if (error?.code === "23505") return fail("finance.alreadyPaid");
  return error ? expenseError(error) : ok(undefined);
}
