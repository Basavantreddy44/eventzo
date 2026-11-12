"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { LISTINGS_TAG } from "@/features/discovery/queries";
import { TAXONOMY_CACHE_TAG } from "@/features/taxonomy/queries";
import {
  areaSchema,
  categorySchema,
  citySchema,
  roleChangeSchema,
  serviceCategorySchema,
  toAreaRow,
  toCategoryRow,
  toCityRow,
  toServiceCategoryRow,
  userBlockSchema,
  vendorStatusSchema,
  type AreaInput,
  type CategoryInput,
  type CityInput,
  type RoleChangeInput,
  type ServiceCategoryInput,
  type TaxonomyKind,
  type UserBlockInput,
  type VendorStatusInput,
} from "../schemas";

type Auth = { ok: true; user: CurrentUser } | { ok: false; result: ActionResult<never> };

/** Server-side permission check before every admin write (RLS and the RPCs check again). */
async function authorise(permission: string): Promise<Auth> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, result: fail("errors.unauthenticated") };
  if (!hasPermission(user.access, permission)) return { ok: false, result: fail("errors.forbidden") };
  return { ok: true, user };
}

const dbFail = (error: { code?: string } | null) => fail(`errors.${mapDbError(error)}`);

// ---------- vendors ---------------------------------------------------------------------
export async function setVendorStatus(input: VendorStatusInput): Promise<ActionResult<string>> {
  const parsed = vendorStatusSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const auth = await authorise("organizations.manage");
  if (!auth.ok) return auth.result;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_organization_status", {
    p_organization_id: parsed.data.organizationId,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason || (null as unknown as string),
  });
  if (error?.code === "22023") return fail("admin.vendors.notAllowed");
  if (error) return dbFail(error);
  updateTag(LISTINGS_TAG); // search and listing pages show / hide the vendor straight away
  return ok(data as string);
}

// ---------- users -----------------------------------------------------------------------
/**
 * Blocks or unblocks sign-in. The database records it (permission checks,
 * reason, audit, sessions ended), then Supabase Auth bans the account so the
 * person can't sign in again. If the Auth call fails, the record is undone.
 */
export async function setUserBlock(input: UserBlockInput): Promise<ActionResult> {
  const parsed = userBlockSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const auth = await authorise("users.block");
  if (!auth.ok) return auth.result;
  const { userId, block, reason } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_block", {
    p_user_id: userId,
    p_block: block,
    p_reason: reason || (null as unknown as string),
  });
  if (error?.code === "22023") return fail("admin.users.cannotBlockSelf");
  if (error) return dbFail(error);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    // No service-role key: the in-app block (signed out everywhere in Eventzo) still applies.
    return ok(undefined);
  }
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: block ? "876000h" : "none",
  });
  if (authError) {
    await supabase.rpc("set_user_block", {
      p_user_id: userId,
      p_block: !block,
      p_reason: block ? (null as unknown as string) : "Restored after a failed unblock",
    });
    return fail("admin.users.authFailed");
  }
  return ok(undefined);
}

export async function changeUserRole(input: RoleChangeInput): Promise<ActionResult> {
  const parsed = roleChangeSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput");
  const auth = await authorise("roles.manage");
  if (!auth.ok) return auth.result;
  const { userId, role, grant } = parsed.data;
  if (!grant && userId === auth.user.id && role === "super_admin") return fail("admin.users.cannotDemoteSelf");

  const supabase = await createClient();
  const { data: roleRow, error: roleError } = await supabase.from("roles").select("id").eq("code", role).single();
  if (roleError || !roleRow) return dbFail(roleError);

  if (grant) {
    const { error } = await supabase
      .from("user_role_assignments")
      .insert({ user_id: userId, role_id: roleRow.id, granted_by: auth.user.id });
    if (error && error.code !== "23505") return dbFail(error); // 23505: already has it
    return ok(undefined);
  }
  const { error } = await supabase
    .from("user_role_assignments")
    .delete()
    .eq("user_id", userId)
    .eq("role_id", roleRow.id);
  if (error?.code === "23514") return fail("admin.users.lastSuperAdmin");
  return error ? dbFail(error) : ok(undefined);
}

// ---------- taxonomy ----------------------------------------------------------------------
const TABLES: Record<TaxonomyKind, "business_categories" | "service_categories" | "cities" | "areas"> = {
  categories: "business_categories",
  services: "service_categories",
  cities: "cities",
  areas: "areas",
};

async function saveRow(
  kind: TaxonomyKind,
  id: string | undefined,
  row: Record<string, unknown>,
): Promise<ActionResult> {
  const auth = await authorise("taxonomy.manage");
  if (!auth.ok) return auth.result;
  const supabase = await createClient();
  const table = TABLES[kind];
  // The row shapes come from the typed to*Row helpers; the table is picked at runtime.
  const res = id
    ? await supabase
        .from(table)
        .update(row as never)
        .eq("id", id)
        .select("id")
    : await supabase
        .from(table)
        .insert(row as never)
        .select("id");
  if (res.error?.code === "23505") return fail("errors.invalidInput", { slug: "admin.taxonomy.slugTaken" });
  if (res.error) return dbFail(res.error);
  if (!res.data?.length) return fail("errors.forbidden");
  updateTag(TAXONOMY_CACHE_TAG);
  return ok(undefined);
}

export async function saveCategory(input: CategoryInput): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  return saveRow("categories", parsed.data.id, toCategoryRow(parsed.data));
}

export async function saveServiceCategory(input: ServiceCategoryInput): Promise<ActionResult> {
  const parsed = serviceCategorySchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  return saveRow("services", parsed.data.id, toServiceCategoryRow(parsed.data));
}

export async function saveCity(input: CityInput): Promise<ActionResult> {
  const parsed = citySchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  return saveRow("cities", parsed.data.id, toCityRow(parsed.data));
}

export async function saveArea(input: AreaInput): Promise<ActionResult> {
  const parsed = areaSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  return saveRow("areas", parsed.data.id, toAreaRow(parsed.data));
}

/** Hides or shows an entry. Entries are never deleted: listings and history refer to them. */
export async function setTaxonomyActive(kind: TaxonomyKind, id: string, active: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success || !(kind in TABLES)) return fail("errors.invalidInput");
  return saveRow(kind, id, { active });
}
