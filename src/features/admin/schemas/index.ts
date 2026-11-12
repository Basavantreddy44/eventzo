import { z } from "zod";

/** Platform admin schemas (Phase 8). Messages are i18n keys. */

const uuid = z.uuid("validation.invalid");
const text = (max: number) => z.string().trim().max(max, "validation.invalid");

// ---------- vendors & users ------------------------------------------------------------
export const VENDOR_ACTIONS = ["suspend", "close", "reinstate"] as const;
export type VendorAction = (typeof VENDOR_ACTIONS)[number];

export const vendorStatusSchema = z
  .object({ organizationId: uuid, action: z.enum(VENDOR_ACTIONS), reason: text(1000) })
  .refine((v) => v.action === "reinstate" || v.reason.length >= 5, {
    path: ["reason"],
    message: "admin.reasonRequired",
  });
export type VendorStatusInput = z.infer<typeof vendorStatusSchema>;

export const userBlockSchema = z
  .object({ userId: uuid, block: z.boolean(), reason: text(500) })
  .refine((v) => !v.block || v.reason.length >= 5, { path: ["reason"], message: "admin.reasonRequired" });
export type UserBlockInput = z.infer<typeof userBlockSchema>;

/** Roles an admin can grant (everyone already has `customer`). */
export const STAFF_ROLES = ["super_admin", "verification_operator", "finance_operator", "support_agent"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const roleChangeSchema = z.object({ userId: uuid, role: z.enum(STAFF_ROLES), grant: z.boolean() });
export type RoleChangeInput = z.infer<typeof roleChangeSchema>;

// ---------- taxonomy ---------------------------------------------------------------------
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(80, "validation.slug")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "validation.slug");
const name = z.string().trim().min(2, "validation.nameLength").max(80, "validation.nameLength");
const order = z
  .string()
  .trim()
  .refine((v) => /^\d{1,4}$/.test(v), "validation.invalid");
const optionalName = text(80);

/** "Kalyana Mantapa & Halls" → "kalyana-mantapa-halls". */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Kannada / Hindi names → name_i18n (empty ones left out, so the English name is the fallback). */
export function toI18n(v: { nameKn: string; nameHi: string }): Record<string, string> {
  const out: Record<string, string> = {};
  if (v.nameKn.trim()) out.kn = v.nameKn.trim();
  if (v.nameHi.trim()) out.hi = v.nameHi.trim();
  return out;
}

export const categorySchema = z.object({
  id: uuid.optional(),
  name,
  slug,
  nameKn: optionalName,
  nameHi: optionalName,
  description: text(500),
  icon: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[a-z0-9-]{2,40}$/.test(v), "validation.invalid"),
  displayOrder: order,
  isLaunchFocus: z.boolean(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export function toCategoryRow(v: CategoryInput) {
  return {
    name: v.name,
    slug: v.slug,
    name_i18n: toI18n(v),
    description: v.description || null,
    icon: v.icon || null,
    display_order: Number(v.displayOrder),
    is_launch_focus: v.isLaunchFocus,
  };
}

export const serviceCategorySchema = z.object({
  id: uuid.optional(),
  businessCategoryId: uuid,
  name,
  slug,
  nameKn: optionalName,
  nameHi: optionalName,
  description: text(500),
  defaultBookingMode: z.enum(["request", "instant"]),
  resourceKindHint: z.union([z.literal(""), z.enum(["venue_space", "artist", "team", "equipment"])]),
  displayOrder: order,
});
export type ServiceCategoryInput = z.infer<typeof serviceCategorySchema>;

export function toServiceCategoryRow(v: ServiceCategoryInput) {
  return {
    business_category_id: v.businessCategoryId,
    name: v.name,
    slug: v.slug,
    name_i18n: toI18n(v),
    description: v.description || null,
    default_booking_mode: v.defaultBookingMode,
    resource_kind_hint: v.resourceKindHint || null,
    display_order: Number(v.displayOrder),
  };
}

export const citySchema = z.object({
  id: uuid.optional(),
  name,
  slug,
  nameKn: optionalName,
  nameHi: optionalName,
  state: z.string().trim().min(2, "validation.required").max(60, "validation.invalid"),
  stateCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "validation.invalid"),
  altNames: text(300),
  isLaunchCity: z.boolean(),
});
export type CityInput = z.infer<typeof citySchema>;

export function toCityRow(v: CityInput) {
  return {
    name: v.name,
    slug: v.slug,
    name_i18n: toI18n(v),
    state: v.state,
    state_code: v.stateCode,
    alt_names: v.altNames
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20),
    is_launch_city: v.isLaunchCity,
  };
}

export const areaSchema = z.object({
  id: uuid.optional(),
  cityId: uuid,
  name,
  slug,
  nameKn: optionalName,
  nameHi: optionalName,
  pincode: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[1-9][0-9]{5}$/.test(v), "validation.pincode"),
});
export type AreaInput = z.infer<typeof areaSchema>;

export function toAreaRow(v: AreaInput) {
  return { city_id: v.cityId, name: v.name, slug: v.slug, name_i18n: toI18n(v), pincode: v.pincode || null };
}

export const TAXONOMY_KINDS = ["categories", "services", "cities", "areas"] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

// ---------- list filters (search params) -------------------------------------------------------
export const PAGE_SIZE = 50;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function pageOf(v: string | string[] | undefined): number {
  const n = Number(one(v));
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

export type AuditFilters = {
  table?: string;
  action?: string;
  actor?: string;
  entity?: string;
  org?: string;
  from?: string;
  to?: string;
  page: number;
};

/** Validates audit-log filters from the URL (unknown or malformed values are dropped). */
export function parseAuditFilters(sp: Record<string, string | string[] | undefined>): AuditFilters {
  const table = one(sp.table);
  const action = one(sp.action);
  const actor = one(sp.actor);
  const entity = one(sp.entity);
  const org = one(sp.org);
  const from = one(sp.from);
  const to = one(sp.to);
  return {
    org: org && z.uuid().safeParse(org).success ? org : undefined,
    table: table && /^[a-z_]{2,63}$/.test(table) ? table : undefined,
    action: action && /^[a-z_.]{2,80}$/.test(action) ? action : undefined,
    actor: actor && z.uuid().safeParse(actor).success ? actor : undefined,
    entity: entity && /^[A-Za-z0-9_-]{1,64}$/.test(entity) ? entity : undefined,
    from: isDate(from) ? from : undefined,
    to: isDate(to) ? to : undefined,
    page: pageOf(sp.page),
  };
}

export const LEDGER_STATUSES = ["paid", "failed", "created"] as const;
export const LEDGER_METHODS = ["razorpay", "offline"] as const;

export type LedgerFilters = {
  status?: (typeof LEDGER_STATUSES)[number];
  method?: (typeof LEDGER_METHODS)[number];
  vendor?: string;
  from?: string;
  to?: string;
  page: number;
};

export function parseLedgerFilters(sp: Record<string, string | string[] | undefined>): LedgerFilters {
  const status = one(sp.status);
  const method = one(sp.method);
  const vendor = one(sp.vendor);
  const from = one(sp.from);
  const to = one(sp.to);
  return {
    status: (LEDGER_STATUSES as readonly string[]).includes(status ?? "")
      ? (status as LedgerFilters["status"])
      : undefined,
    method: (LEDGER_METHODS as readonly string[]).includes(method ?? "")
      ? (method as LedgerFilters["method"])
      : undefined,
    vendor: vendor && z.uuid().safeParse(vendor).success ? vendor : undefined,
    from: isDate(from) ? from : undefined,
    to: isDate(to) ? to : undefined,
    page: pageOf(sp.page),
  };
}
