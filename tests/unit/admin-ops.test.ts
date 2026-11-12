import { describe, expect, it } from "vitest";
import {
  areaSchema,
  categorySchema,
  citySchema,
  pageOf,
  parseAuditFilters,
  parseLedgerFilters,
  roleChangeSchema,
  slugify,
  toCategoryRow,
  toCityRow,
  toI18n,
  userBlockSchema,
  vendorStatusSchema,
} from "@/features/admin/schemas";
import { mapAuthError } from "@/features/auth/lib/map-auth-error";

const UUID = "3f1c2b7e-9a4d-4c1e-8f2a-1b2c3d4e5f60";

describe("vendor status & user block schemas", () => {
  it("needs a reason to suspend or close, not to reinstate", () => {
    expect(vendorStatusSchema.safeParse({ organizationId: UUID, action: "suspend", reason: "bad" }).success).toBe(
      false,
    );
    expect(vendorStatusSchema.safeParse({ organizationId: UUID, action: "close", reason: "Owner asked" }).success).toBe(
      true,
    );
    expect(vendorStatusSchema.safeParse({ organizationId: UUID, action: "reinstate", reason: "" }).success).toBe(true);
    expect(vendorStatusSchema.safeParse({ organizationId: UUID, action: "delete", reason: "xxxxxx" }).success).toBe(
      false,
    );
  });

  it("needs a reason to block, not to unblock", () => {
    expect(userBlockSchema.safeParse({ userId: UUID, block: true, reason: "  " }).success).toBe(false);
    expect(userBlockSchema.safeParse({ userId: UUID, block: true, reason: "Fake bookings" }).success).toBe(true);
    expect(userBlockSchema.safeParse({ userId: UUID, block: false, reason: "" }).success).toBe(true);
  });

  it("only grants platform staff roles", () => {
    expect(roleChangeSchema.safeParse({ userId: UUID, role: "finance_operator", grant: true }).success).toBe(true);
    expect(roleChangeSchema.safeParse({ userId: UUID, role: "customer", grant: false }).success).toBe(false);
    expect(roleChangeSchema.safeParse({ userId: UUID, role: "owner", grant: true }).success).toBe(false);
  });

  it("shows blocked people a clear sign-in message", () => {
    expect(mapAuthError({ code: "user_banned" })).toBe("auth.errors.blocked");
  });
});

describe("taxonomy", () => {
  it("makes URL names from English names", () => {
    expect(slugify("Kalyana Mantapa & Halls")).toBe("kalyana-mantapa-and-halls");
    expect(slugify("  Café Décor!! ")).toBe("cafe-decor");
    expect(slugify("a".repeat(100))).toHaveLength(80);
  });

  it("keeps only the translations that were typed", () => {
    expect(toI18n({ nameKn: " ಕಲ್ಯಾಣ ಮಂಟಪ ", nameHi: "" })).toEqual({ kn: "ಕಲ್ಯಾಣ ಮಂಟಪ" });
  });

  it("validates a category", () => {
    const base = {
      name: "Venues",
      slug: "venues",
      nameKn: "",
      nameHi: "",
      description: "",
      icon: "building-2",
      displayOrder: "10",
      isLaunchFocus: true,
    };
    expect(toCategoryRow(categorySchema.parse(base))).toMatchObject({
      display_order: 10,
      icon: "building-2",
      name_i18n: {},
    });
    expect(categorySchema.safeParse({ ...base, slug: "Venues Halls" }).success).toBe(false);
    expect(categorySchema.safeParse({ ...base, icon: "<svg>" }).success).toBe(false);
    expect(categorySchema.safeParse({ ...base, displayOrder: "-1" }).success).toBe(false);
  });

  it("splits a city's other names and upper-cases the state code", () => {
    const row = toCityRow(
      citySchema.parse({
        name: "Kalaburagi",
        slug: "kalaburagi",
        nameKn: "",
        nameHi: "",
        state: "Karnataka",
        stateCode: "ka",
        altNames: "Gulbarga, , Kalburgi",
        isLaunchCity: false,
      }),
    );
    expect(row.alt_names).toEqual(["Gulbarga", "Kalburgi"]);
    expect(row.state_code).toBe("KA");
  });

  it("checks an area's PIN code", () => {
    const base = { cityId: UUID, name: "Jayanagar", slug: "jayanagar", nameKn: "", nameHi: "" };
    expect(areaSchema.safeParse({ ...base, pincode: "560041" }).success).toBe(true);
    expect(areaSchema.safeParse({ ...base, pincode: "056004" }).success).toBe(false);
  });
});

describe("admin list filters", () => {
  it("keeps valid audit filters and drops the rest", () => {
    expect(
      parseAuditFilters({
        table: "organizations",
        action: "user.blocked",
        actor: UUID,
        org: "not-a-uuid",
        entity: "abc'; drop",
        from: "2026-11-01",
        to: "11/12/2026",
        page: "3",
      }),
    ).toEqual({
      table: "organizations",
      action: "user.blocked",
      actor: UUID,
      org: undefined,
      entity: undefined,
      from: "2026-11-01",
      to: undefined,
      page: 3,
    });
  });

  it("keeps valid ledger filters", () => {
    expect(parseLedgerFilters({ status: "paid", method: "cash", vendor: UUID, page: "x" })).toEqual({
      status: "paid",
      method: undefined,
      vendor: UUID,
      from: undefined,
      to: undefined,
      page: 1,
    });
  });

  it("bounds the page number", () => {
    expect(pageOf("0")).toBe(1);
    expect(pageOf("2.5")).toBe(1);
    expect(pageOf(["4", "9"])).toBe(4);
    expect(pageOf("999999")).toBe(1);
  });
});
