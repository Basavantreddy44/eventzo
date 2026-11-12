"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { dbFail, requireVendorActor } from "../lib/actor";
import { branchSchema, toBranchRow, type BranchInput } from "../schemas";

/** Owners add branches; owners and that branch's managers edit (RLS enforces). */
export async function saveBranch(input: BranchInput): Promise<ActionResult> {
  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const actor = await requireVendorActor(parsed.data.id ? ["owner", "branch_manager"] : ["owner"]);
  if (!actor.ok) return actor.result;
  const orgId = actor.ctx.membership.organization_id;

  const supabase = await createClient();
  const row = toBranchRow(parsed.data);
  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("branches")
      .update(row)
      .eq("id", parsed.data.id)
      .eq("organization_id", orgId)
      .select("id");
    if (error) return dbFail(error);
    if (!data?.length) return fail("errors.forbidden");
  } else {
    const { error } = await supabase.from("branches").insert({ ...row, organization_id: orgId });
    if (error) return dbFail(error);
  }
  return ok(undefined);
}

/** Owner-only. The primary branch can't be deactivated. */
export async function setBranchActive(branchId: string, active: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(branchId).success) return fail("errors.invalidInput");
  const actor = await requireVendorActor(["owner"]);
  if (!actor.ok) return actor.result;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .update({ active })
    .eq("id", branchId)
    .eq("organization_id", actor.ctx.membership.organization_id)
    .eq("is_primary", false)
    .select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("errors.forbidden");
  return ok(undefined);
}
