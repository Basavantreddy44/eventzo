"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { rupeesToPaise } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { LISTINGS_TAG } from "@/features/discovery/queries";
import { dbFail, requireVendorActor } from "../lib/actor";
import { packageSchema, type PackageInput } from "../schemas";

const EDITORS = ["owner", "branch_manager"] as const;

/** Create or update a listing package (Roadmap C6/V4). RLS enforces who may edit which listing. */
export async function savePackage(input: PackageInput): Promise<ActionResult<string>> {
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const actor = await requireVendorActor(EDITORS);
  if (!actor.ok) return actor.result;
  const orgId = actor.ctx.membership.organization_id;
  const v = parsed.data;
  const row = {
    name: v.name,
    description: v.description || null,
    price_paise: Number(rupeesToPaise(v.price)),
    price_unit: v.priceUnit || null,
    includes: v.includes,
    excludes: v.excludes,
  };

  const supabase = await createClient();
  if (v.id) {
    const { data, error } = await supabase
      .from("service_packages")
      .update(row)
      .eq("id", v.id)
      .eq("organization_id", orgId)
      .select("id");
    if (error) return dbFail(error);
    if (!data?.length) return fail("errors.forbidden");
    updateTag(LISTINGS_TAG);
    return ok(v.id);
  }
  const { data, error } = await supabase
    .from("service_packages")
    .insert({ ...row, service_id: v.serviceId, organization_id: orgId, created_by: actor.ctx.user.id })
    .select("id")
    .single();
  if (error) return error.code === "23514" ? fail("vendor.packages.tooMany") : dbFail(error);
  updateTag(LISTINGS_TAG);
  return ok(data.id);
}

export async function deletePackage(packageId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(packageId).success) return fail("errors.invalidInput");
  const actor = await requireVendorActor(EDITORS);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_packages")
    .delete()
    .eq("id", packageId)
    .eq("organization_id", actor.ctx.membership.organization_id)
    .select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("errors.forbidden");
  updateTag(LISTINGS_TAG);
  return ok(undefined);
}
