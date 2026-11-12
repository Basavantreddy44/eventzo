import { describe, expect, it } from "vitest";
import {
  hasOrgRole,
  hasPermission,
  hasRole,
  isPlatformAdmin,
  isVendorMember,
  resolveActiveMembership,
  vendorMemberships,
} from "@/lib/auth/permissions";
import type { MyAccess } from "@/types/database";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const ORG_CLOSED = "33333333-3333-4333-8333-333333333333";

function access(partial: Partial<MyAccess> = {}): MyAccess {
  return { user_id: "u1", roles: ["customer"], permissions: [], memberships: [], ...partial };
}

const membership = (
  id: string,
  role: "owner" | "branch_manager" | "staff",
  status: "active" | "closed" = "active",
) => ({
  organization_id: id,
  organization_name: `Org ${id.slice(0, 4)}`,
  organization_slug: `org-${id.slice(0, 4)}`,
  organization_status: status,
  verification_status: "unverified" as const,
  role,
});

describe("platform permissions", () => {
  it("a plain customer is not an admin", () => {
    const a = access();
    expect(isPlatformAdmin(a)).toBe(false);
    expect(hasRole(a, "customer")).toBe(true);
    expect(hasPermission(a, "audit.read")).toBe(false);
  });

  it("admin access comes from the admin.access permission, not a role name", () => {
    expect(isPlatformAdmin(access({ roles: ["support_agent"], permissions: ["admin.access", "support.manage"] }))).toBe(
      true,
    );
    expect(isPlatformAdmin(access({ roles: ["super_admin"], permissions: [] }))).toBe(false);
  });

  it("handles a missing access snapshot (signed out)", () => {
    expect(isPlatformAdmin(null)).toBe(false);
    expect(hasPermission(undefined, "admin.access")).toBe(false);
    expect(isVendorMember(null)).toBe(false);
    expect(resolveActiveMembership(null, ORG_A)).toBeNull();
  });
});

describe("organisation membership", () => {
  const a = access({
    memberships: [membership(ORG_A, "owner"), membership(ORG_B, "staff"), membership(ORG_CLOSED, "owner", "closed")],
  });

  it("ignores closed organisations", () => {
    expect(vendorMemberships(a).map((m) => m.organization_id)).toEqual([ORG_A, ORG_B]);
    expect(hasOrgRole(a, ORG_CLOSED, ["owner"])).toBe(false);
  });

  it("checks the role per organisation", () => {
    expect(hasOrgRole(a, ORG_A, ["owner"])).toBe(true);
    expect(hasOrgRole(a, ORG_B, ["owner"])).toBe(false);
    expect(hasOrgRole(a, ORG_B, ["owner", "staff"])).toBe(true);
  });

  it("honours a preferred organisation only when the user is a member", () => {
    expect(resolveActiveMembership(a, ORG_B)?.organization_id).toBe(ORG_B);
    expect(resolveActiveMembership(a, "99999999-9999-4999-8999-999999999999")?.organization_id).toBe(ORG_A);
    expect(resolveActiveMembership(a, ORG_CLOSED)?.organization_id).toBe(ORG_A);
    expect(resolveActiveMembership(a, null)?.organization_id).toBe(ORG_A);
  });

  it("a customer with no memberships is not a vendor", () => {
    expect(isVendorMember(access())).toBe(false);
    expect(resolveActiveMembership(access(), ORG_A)).toBeNull();
  });
});
