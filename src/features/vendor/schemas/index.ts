import { z } from "zod";
import { routing } from "@/i18n/routing";
import { rupeesToPaise } from "@/lib/money";
import { normalizePhone } from "@/features/account/schemas";
import { percentToBps } from "@/features/enquiries/lib/quote";
import { advancePercentToBps } from "@/features/bookings/lib/money";

/**
 * Vendor ERP form schemas. Messages are i18n keys. Amounts are typed in rupees
 * and converted to integer paise (D6) by the `to*Row` helpers.
 */

const optionalText = (max: number) => z.string().trim().max(max, "validation.invalid");
const optionalPhone = z
  .string()
  .trim()
  .refine((v) => v === "" || normalizePhone(v) !== null, "validation.phone");
const optionalRupees = z
  .string()
  .trim()
  .refine((v) => v === "" || rupeesToPaise(v) !== null, "validation.amount");
const optionalCount = (max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{1,7}$/.test(v) && Number(v) >= 0 && Number(v) <= max), "validation.invalid");

const toPhone = (v: string) => (v ? normalizePhone(v) : null);
const toPaise = (v: string) => (v ? Number(rupeesToPaise(v)) : null);
const toInt = (v: string) => (v === "" ? null : Number(v));

// ---------- business profile --------------------------------------------------
export const businessProfileSchema = z.object({
  name: z.string().trim().min(2, "validation.nameLength").max(120, "validation.nameLength"),
  legalName: optionalText(200),
  displayName: optionalText(120),
  tagline: optionalText(160),
  description: optionalText(5000),
  yearEstablished: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{4}$/.test(v) && Number(v) >= 1900 && Number(v) <= 2100), "validation.year"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), "validation.gstin"),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v), "validation.pan"),
  contactEmail: z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, "validation.email"),
  contactPhone: optionalPhone,
  whatsappPhone: optionalPhone,
  website: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v), "validation.url"),
  languages: z.array(z.enum(routing.locales)).min(1, "validation.languages"),
});
export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

export function toBusinessProfileRow(v: BusinessProfileInput) {
  return {
    display_name: v.displayName || null,
    tagline: v.tagline || null,
    description: v.description || null,
    year_established: v.yearEstablished ? Number(v.yearEstablished) : null,
    gstin: v.gstin || null,
    pan: v.pan || null,
    contact_email: v.contactEmail || null,
    contact_phone: toPhone(v.contactPhone),
    whatsapp_phone: toPhone(v.whatsappPhone),
    website: v.website || null,
    languages: v.languages,
  };
}

// ---------- branches ----------------------------------------------------------
export const branchSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "validation.nameLength").max(120, "validation.nameLength"),
  cityId: z.uuid("validation.select"),
  areaId: z.union([z.literal(""), z.uuid()]),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  pincode: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[1-9][0-9]{5}$/.test(v), "validation.pincode"),
  phone: optionalPhone,
});
export type BranchInput = z.infer<typeof branchSchema>;

export function toBranchRow(v: BranchInput) {
  return {
    name: v.name,
    city_id: v.cityId,
    area_id: v.areaId || null,
    address_line1: v.addressLine1 || null,
    address_line2: v.addressLine2 || null,
    pincode: v.pincode || null,
    phone: toPhone(v.phone),
  };
}

// ---------- listings -------------------------------------------------------------
const policy = z.enum(["", "in_house_only", "outside_allowed", "both"]);
const triState = z.enum(["", "yes", "no"]);

export const listingSchema = z
  .object({
    id: z.uuid().optional(),
    serviceCategoryId: z.uuid("validation.select"),
    title: z.string().trim().min(3, "validation.titleLength").max(120, "validation.titleLength"),
    summary: optionalText(300),
    description: optionalText(5000),
    bookingMode: z.enum(["request", "instant"]),
    branchId: z.union([z.literal(""), z.uuid()]),
    cityId: z.uuid("validation.select"),
    areaId: z.union([z.literal(""), z.uuid()]),
    priceType: z.enum(["fixed", "starting_from", "range", "on_request"]),
    priceUnit: z.enum(["", "per_event", "per_day", "per_plate", "per_person", "per_hour", "per_session"]),
    base: optionalRupees,
    max: optionalRupees,
    minGuests: optionalCount(100_000),
    maxGuests: optionalCount(100_000),
    // (B) optional surcharge on auspicious dates, in percent (stored as basis points)
    auspiciousSurcharge: z
      .string()
      .trim()
      .refine((v) => v === "" || percentToBps(v) !== null, "validation.percent"),
    // Phase 5: advance % (whole percent, 10–100) and cancellation policy, snapshotted onto bookings
    advancePercent: z
      .string()
      .trim()
      .refine((v) => advancePercentToBps(v) !== null, "validation.advancePercent"),
    cancellationPolicy: z.enum(["flexible", "moderate", "strict"], "validation.select"),
    venue: z
      .object({
        seated: optionalCount(100_000),
        floating: optionalCount(100_000),
        dining: optionalCount(100_000),
        rooms: optionalCount(1_000),
        parking: optionalCount(100_000),
        areaSqft: optionalCount(10_000_000),
        airConditioned: triState,
        alcoholAllowed: triState,
        cateringPolicy: policy,
        decorPolicy: policy,
      })
      .optional(),
    catering: z
      .object({
        vegPlate: optionalRupees,
        nonvegPlate: optionalRupees,
        cuisines: optionalText(300),
        minPlates: optionalCount(100_000),
        maxPlates: optionalCount(100_000),
        liveCounters: z.boolean(),
        staffIncluded: z.boolean(),
      })
      .optional(),
  })
  .refine((v) => v.priceType === "on_request" || (v.base !== "" && v.priceUnit !== ""), {
    path: ["base"],
    message: "validation.priceRequired",
  })
  .refine(
    (v) => v.priceType !== "range" || (v.max !== "" && (rupeesToPaise(v.max) ?? 0n) >= (rupeesToPaise(v.base) ?? 0n)),
    { path: ["max"], message: "validation.priceRange" },
  )
  .refine((v) => v.minGuests === "" || v.maxGuests === "" || Number(v.maxGuests) >= Number(v.minGuests), {
    path: ["maxGuests"],
    message: "validation.guestRange",
  })
  .refine(
    (v) =>
      !v.catering ||
      v.catering.minPlates === "" ||
      v.catering.maxPlates === "" ||
      Number(v.catering.maxPlates) >= Number(v.catering.minPlates),
    { path: ["catering", "maxPlates"], message: "validation.guestRange" },
  );
export type ListingInput = z.infer<typeof listingSchema>;

export function toServiceRow(v: ListingInput) {
  const priced = v.priceType !== "on_request";
  return {
    service_category_id: v.serviceCategoryId,
    title: v.title,
    summary: v.summary || null,
    description: v.description || null,
    booking_mode: v.bookingMode,
    branch_id: v.branchId || null,
    city_id: v.cityId,
    area_id: v.areaId || null,
    price_type: v.priceType,
    price_unit: priced ? (v.priceUnit as Exclude<ListingInput["priceUnit"], "">) : null,
    base_price_paise: priced ? toPaise(v.base) : null,
    max_price_paise: v.priceType === "range" ? toPaise(v.max) : null,
    min_guests: toInt(v.minGuests) || null,
    max_guests: toInt(v.maxGuests) || null,
    auspicious_surcharge_bps: v.auspiciousSurcharge ? (percentToBps(v.auspiciousSurcharge) ?? 0) : 0,
    advance_bps: advancePercentToBps(v.advancePercent) ?? 2500,
    cancellation_policy: v.cancellationPolicy,
  };
}

const tri = (v: "" | "yes" | "no") => (v === "" ? null : v === "yes");
const pol = (v: z.infer<typeof policy>) => (v === "" ? null : v);

export function toVenueRow(v: NonNullable<ListingInput["venue"]>) {
  return {
    seated_capacity: toInt(v.seated) || null,
    floating_capacity: toInt(v.floating) || null,
    dining_capacity: toInt(v.dining) || null,
    rooms: toInt(v.rooms),
    parking_cars: toInt(v.parking),
    area_sqft: toInt(v.areaSqft) || null,
    air_conditioned: tri(v.airConditioned),
    alcohol_allowed: tri(v.alcoholAllowed),
    catering_policy: pol(v.cateringPolicy),
    decor_policy: pol(v.decorPolicy),
  };
}

export function toCateringRow(v: NonNullable<ListingInput["catering"]>) {
  return {
    veg_price_per_plate_paise: toPaise(v.vegPlate),
    nonveg_price_per_plate_paise: toPaise(v.nonvegPlate),
    cuisines: v.cuisines
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 12),
    min_plates: toInt(v.minPlates) || null,
    max_plates: toInt(v.maxPlates) || null,
    live_counters: v.liveCounters,
    service_staff_included: v.staffIncluded,
  };
}

export const SERVICE_STATUS_TRANSITIONS = {
  draft: ["published", "archived"],
  published: ["paused", "archived"],
  paused: ["published", "archived"],
  archived: ["draft"],
} as const;

// ---------- bookable resources -------------------------------------------------------
const minutes = z
  .string()
  .trim()
  .refine((v) => /^\d{1,4}$/.test(v) && Number(v) <= 2880, "validation.minutes");

export const resourceSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "validation.required").max(120, "validation.nameLength"),
    kind: z.enum(["venue_space", "artist", "team", "equipment"]),
    allocationMode: z.enum(["exclusive", "capacity"]),
    capacity: z.string().trim(),
    serviceId: z.union([z.literal(""), z.uuid()]),
    branchId: z.union([z.literal(""), z.uuid()]),
    /** Phase 7: an artist/team resource can be one roster member's own calendar. */
    staffProfileId: z.union([z.literal(""), z.uuid()]).optional(),
    setupBufferMin: minutes,
    breakdownBufferMin: minutes,
    travelBufferMin: minutes,
  })
  .refine((v) => v.allocationMode === "exclusive" || (/^\d{1,6}$/.test(v.capacity) && Number(v.capacity) >= 1), {
    path: ["capacity"],
    message: "validation.capacity",
  })
  .refine((v) => !v.staffProfileId || v.kind === "artist" || v.kind === "team", {
    path: ["staffProfileId"],
    message: "vendor.resources.staffOnlyArtist",
  });
export type ResourceInput = z.infer<typeof resourceSchema>;

export function toResourceRow(v: ResourceInput) {
  return {
    name: v.name,
    kind: v.kind,
    allocation_mode: v.allocationMode,
    capacity: v.allocationMode === "capacity" ? Number(v.capacity) : 1,
    service_id: v.serviceId || null,
    branch_id: v.branchId || null,
    staff_profile_id: v.kind === "artist" || v.kind === "team" ? v.staffProfileId || null : null,
    setup_buffer_min: Number(v.setupBufferMin),
    breakdown_buffer_min: Number(v.breakdownBufferMin),
    travel_buffer_min: Number(v.travelBufferMin),
  };
}

// ---------- team ---------------------------------------------------------------------
export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "validation.required").pipe(z.email("validation.email")),
  role: z.enum(["branch_manager", "staff"]),
  branchIds: z.array(z.uuid()).max(50),
});
export type InviteInput = z.infer<typeof inviteSchema>;

// ---------- documents ---------------------------------------------------------------
export const DOCUMENT_TYPES = [
  "gst_certificate",
  "pan_card",
  "trade_license",
  "fssai_license",
  "fire_noc",
  "shop_establishment",
  "cancelled_cheque",
  "identity_proof",
  "other",
] as const;
export const DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 12;

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export function extensionFor(mime: string): string | null {
  return EXTENSIONS[mime] ?? null;
}

/** Storage object paths are always {organization_id}/{uuid}.{ext}. */
export function isOrgObjectPath(path: string, organizationId: string): boolean {
  return new RegExp(`^${organizationId}/[0-9a-f-]{36}\\.(pdf|jpg|png|webp)$`).test(path);
}

export const registerDocumentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  storagePath: z.string().min(10).max(200),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(DOCUMENT_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(DOCUMENT_MAX_BYTES),
});
export type RegisterDocumentInput = z.infer<typeof registerDocumentSchema>;
