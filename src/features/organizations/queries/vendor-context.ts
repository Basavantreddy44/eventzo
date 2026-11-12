import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { appCookies } from "@/config/site";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { resolveActiveMembership, type Membership } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { BranchRow } from "@/types/database";

export type VendorContext = {
  user: CurrentUser;
  membership: Membership;
  branches: Pick<BranchRow, "id" | "name" | "is_primary">[];
  /** null = all branches (owners only). */
  activeBranchId: string | null;
};

/**
 * Resolves the vendor workspace for this request. The organisation comes from
 * the user's own memberships (a cookie only expresses a preference among
 * them); branches come from RLS, so managers only see their branches.
 */
export const getVendorContext = cache(async (): Promise<VendorContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const store = await cookies();
  const membership = resolveActiveMembership(user.access, store.get(appCookies.activeOrganization)?.value);
  if (!membership) return null;

  const supabase = await createClient();
  const { data: branches, error } = await supabase
    .from("branches")
    .select("id, name, is_primary")
    .eq("organization_id", membership.organization_id)
    .eq("active", true)
    .order("is_primary", { ascending: false })
    .order("name");
  if (error) throw new Error(`Failed to load branches: ${error.message}`);

  const visible = branches ?? [];
  const preferred = store.get(appCookies.activeBranch)?.value;
  let activeBranchId = visible.find((b) => b.id === preferred)?.id ?? null;
  // Non-owners can't use "all branches"; default them to their first branch.
  if (!activeBranchId && membership.role !== "owner") activeBranchId = visible[0]?.id ?? null;

  return { user, membership, branches: visible, activeBranchId };
});
