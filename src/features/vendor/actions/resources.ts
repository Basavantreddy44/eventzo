"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { dbFail, requireVendorActor } from "../lib/actor";
import { resourceSchema, toResourceRow, type ResourceInput } from "../schemas";

/** Owners, or branch managers for their own branch (RLS: can_manage_resource). */
export async function saveResource(input: ResourceInput): Promise<ActionResult> {
  const parsed = resourceSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const actor = await requireVendorActor(["owner", "branch_manager"]);
  if (!actor.ok) return actor.result;
  const orgId = actor.ctx.membership.organization_id;

  const supabase = await createClient();
  const row = toResourceRow(parsed.data);
  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("bookable_resources")
      .update(row)
      .eq("id", parsed.data.id)
      .eq("organization_id", orgId)
      .select("id");
    // 23514 here = changing the booking style while reservations are active
    if (error?.code === "23514") return fail("vendor.resources.modeLocked");
    if (error?.code === "23505") return fail("errors.invalidInput", { staffProfileId: "vendor.resources.staffTaken" });
    if (error) return dbFail(error);
    if (!data?.length) return fail("errors.forbidden");
  } else {
    const { error } = await supabase
      .from("bookable_resources")
      .insert({ ...row, organization_id: orgId, created_by: actor.ctx.user.id });
    if (error?.code === "23505") return fail("errors.invalidInput", { staffProfileId: "vendor.resources.staffTaken" });
    if (error) return dbFail(error);
  }
  return ok(undefined);
}

export async function setResourceActive(resourceId: string, active: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(resourceId).success) return fail("errors.invalidInput");
  const actor = await requireVendorActor(["owner", "branch_manager"]);
  if (!actor.ok) return actor.result;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookable_resources")
    .update({ active })
    .eq("id", resourceId)
    .eq("organization_id", actor.ctx.membership.organization_id)
    .select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("errors.forbidden");
  return ok(undefined);
}
