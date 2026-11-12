import "server-only";

import { fail, mapDbError, type ActionResult } from "@/lib/errors";
import { getVendorContext, type VendorContext } from "@/features/organizations/queries/vendor-context";
import type { OrgRole } from "@/types/database";

export type VendorActor = { ok: true; ctx: VendorContext } | { ok: false; result: ActionResult<never> };

/**
 * Server Action guard: resolves the caller's active vendor workspace (from
 * their own memberships, never from client input) and checks the role.
 * RLS re-checks everything underneath.
 */
export async function requireVendorActor(roles?: readonly OrgRole[]): Promise<VendorActor> {
  const ctx = await getVendorContext();
  if (!ctx) return { ok: false, result: fail("errors.forbidden") };
  if (roles && !roles.includes(ctx.membership.role)) return { ok: false, result: fail("vendor.ownerOnly") };
  return { ok: true, ctx };
}

/** Maps a PostgREST/Postgres error to an i18n key under `errors.*`. */
export function dbFail(error: { code?: string | null } | null): ActionResult<never> {
  return fail(`errors.${mapDbError(error)}`);
}
