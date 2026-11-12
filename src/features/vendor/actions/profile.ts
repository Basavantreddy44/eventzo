"use server";

import { updateTag } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { LISTINGS_TAG } from "@/features/discovery/queries";
import { dbFail, requireVendorActor } from "../lib/actor";
import { businessProfileSchema, toBusinessProfileRow, type BusinessProfileInput } from "../schemas";

/** Owner-only. Completing description + phone can take the vendor live (DB trigger). */
export async function updateBusinessProfile(input: BusinessProfileInput): Promise<ActionResult> {
  const parsed = businessProfileSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const actor = await requireVendorActor(["owner"]);
  if (!actor.ok) return actor.result;
  const orgId = actor.ctx.membership.organization_id;

  const supabase = await createClient();
  const { error: orgError } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name, legal_name: parsed.data.legalName || null })
    .eq("id", orgId);
  if (orgError) return dbFail(orgError);

  const { error } = await supabase
    .from("business_profiles")
    .update(toBusinessProfileRow(parsed.data))
    .eq("organization_id", orgId);
  if (error) return dbFail(error);

  updateTag(LISTINGS_TAG); // vendor name / about text appear on public listings
  return ok(undefined);
}
