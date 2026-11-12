import type { MyAccess, OrgRole } from "@/types/database";

/**
 * Pure permission helpers over the caller's access snapshot (from the
 * `my_access()` RPC). These drive server-side checks and UI hiding only —
 * RLS in the database is always the real enforcement layer.
 */

export type Membership = MyAccess["memberships"][number];

export const ADMIN_ACCESS_PERMISSION = "admin.access";

export const PLATFORM_ROLES = [
  "customer",
  "super_admin",
  "verification_operator",
  "finance_operator",
  "support_agent",
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export function hasPermission(access: MyAccess | null | undefined, permission: string): boolean {
  return !!access?.permissions.includes(permission);
}

export function hasRole(access: MyAccess | null | undefined, role: PlatformRole): boolean {
  return !!access?.roles.includes(role);
}

export function isPlatformAdmin(access: MyAccess | null | undefined): boolean {
  return hasPermission(access, ADMIN_ACCESS_PERMISSION);
}

/** Active memberships in organisations that are not closed. */
export function vendorMemberships(access: MyAccess | null | undefined): Membership[] {
  return (access?.memberships ?? []).filter((m) => m.organization_status !== "closed");
}

export function isVendorMember(access: MyAccess | null | undefined): boolean {
  return vendorMemberships(access).length > 0;
}

export function hasOrgRole(
  access: MyAccess | null | undefined,
  organizationId: string,
  roles: readonly OrgRole[],
): boolean {
  return vendorMemberships(access).some((m) => m.organization_id === organizationId && roles.includes(m.role));
}

/**
 * Picks the organisation the vendor UI works on. A preferred id (e.g. from a
 * cookie) is honoured only if the user is actually a member of it — the
 * client never decides organisation_id on its own.
 */
export function resolveActiveMembership(
  access: MyAccess | null | undefined,
  preferredOrganizationId?: string | null,
): Membership | null {
  const memberships = vendorMemberships(access);
  if (memberships.length === 0) return null;
  return memberships.find((m) => m.organization_id === preferredOrganizationId) ?? memberships[0];
}
