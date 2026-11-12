"use server";

import { cookies } from "next/headers";
import { redirect as nextRedirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import { appCookies } from "@/config/site";
import { getCurrentUser } from "@/lib/auth/session";
import { hasOrgRole, resolveActiveMembership } from "@/lib/auth/permissions";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import {
  branchSelectionSchema,
  createOrganizationSchema,
  organizationIdSchema,
  type CreateOrganizationInput,
} from "../schemas";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

/**
 * Vendor onboarding. The organisation and the owner membership are created
 * atomically by the `create_organization` RPC — never by a client insert.
 */
export async function createOrganization(input: CreateOrganizationInput): Promise<ActionResult> {
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));

  const user = await getCurrentUser();
  if (!user) return fail("errors.unauthenticated");

  const supabase = await createClient();
  const { data: organizationId, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_business_category_id: parsed.data.businessCategoryId,
    p_city_id: parsed.data.cityId,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error || !organizationId) return fail(`errors.${mapDbError(error)}`);

  const store = await cookies();
  store.set(appCookies.activeOrganization, organizationId, cookieOptions);
  store.delete(appCookies.activeBranch);

  nextRedirect(getPathname({ href: "/vendor", locale: await getLocale() }));
}

/** Switches the vendor workspace. Membership is re-verified server-side. */
export async function setActiveOrganization(organizationId: string): Promise<ActionResult> {
  const parsed = organizationIdSchema.safeParse(organizationId);
  if (!parsed.success) return fail("errors.invalidInput");

  const user = await getCurrentUser();
  if (!user) return fail("errors.unauthenticated");
  const membership = resolveActiveMembership(user.access, parsed.data);
  if (membership?.organization_id !== parsed.data) return fail("errors.forbidden");

  const store = await cookies();
  store.set(appCookies.activeOrganization, parsed.data, cookieOptions);
  store.delete(appCookies.activeBranch);
  return ok(undefined);
}

/** Switches the branch filter. RLS decides which branches are visible. */
export async function setActiveBranch(selection: string): Promise<ActionResult> {
  const parsed = branchSelectionSchema.safeParse(selection);
  if (!parsed.success) return fail("errors.invalidInput");

  const user = await getCurrentUser();
  if (!user) return fail("errors.unauthenticated");

  const store = await cookies();
  const membership = resolveActiveMembership(user.access, store.get(appCookies.activeOrganization)?.value);
  if (!membership) return fail("errors.forbidden");

  if (parsed.data === "all") {
    if (!hasOrgRole(user.access, membership.organization_id, ["owner"])) return fail("errors.forbidden");
    store.delete(appCookies.activeBranch);
    return ok(undefined);
  }

  const supabase = await createClient();
  const { data: branch } = await supabase
    .from("branches")
    .select("id")
    .eq("id", parsed.data)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!branch) return fail("errors.forbidden");

  store.set(appCookies.activeBranch, branch.id, cookieOptions);
  return ok(undefined);
}
