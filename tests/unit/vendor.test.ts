import { describe, expect, it } from "vitest";
import { toFieldErrors } from "@/features/auth/schemas";
import {
  businessProfileSchema,
  inviteSchema,
  isOrgObjectPath,
  listingSchema,
  resourceSchema,
  SERVICE_STATUS_TRANSITIONS,
  toBusinessProfileRow,
  toCateringRow,
  toResourceRow,
  toServiceRow,
  toVenueRow,
  type ListingInput,
} from "@/features/vendor/schemas";
import { emptyListing, listingToInput } from "@/features/vendor/lib/listing-defaults";

const UUID = "0b6c1c38-4a3e-4c55-9d43-5d0d7b7d3a11";
const ORG = "11111111-1111-4111-8111-111111111111";

const errorsOf = (schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, value: unknown) => {
  const r = schema.safeParse(value) as { success: boolean; error?: Parameters<typeof toFieldErrors>[0] };
  return r.success ? {} : toFieldErrors(r.error!);
};

describe("business profile", () => {
  const base = {
    name: "Sri Lakshmi Kalyana Mantapa",
    legalName: "",
    displayName: "",
    tagline: "",
    description: "Family-run since 1998.",
    yearEstablished: "1998",
    gstin: "29abcde1234f1z5",
    pan: "abcde1234f",
    contactEmail: "",
    contactPhone: "98450 12345",
    whatsappPhone: "",
    website: "https://example.in",
    languages: ["en", "kn"] as ("en" | "kn" | "hi")[],
  };

  it("uppercases tax ids and normalises phones", () => {
    const row = toBusinessProfileRow(businessProfileSchema.parse(base));
    expect(row).toMatchObject({
      gstin: "29ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      contact_phone: "+919845012345",
      whatsapp_phone: null,
    });
  });

  it.each([
    [{ gstin: "123" }, "gstin", "validation.gstin"],
    [{ pan: "12345ABCDE" }, "pan", "validation.pan"],
    [{ website: "example.in" }, "website", "validation.url"],
    [{ yearEstablished: "1850" }, "yearEstablished", "validation.year"],
    [{ languages: [] }, "languages", "validation.languages"],
    [{ contactPhone: "12" }, "contactPhone", "validation.phone"],
  ])("rejects %o", (patch, field, key) => {
    expect(errorsOf(businessProfileSchema, { ...base, ...patch })[field]).toBe(key);
  });
});

describe("listing", () => {
  const base: ListingInput = {
    ...emptyListing({ cityId: UUID, branchId: "" }),
    serviceCategoryId: UUID,
    title: "Main hall",
    priceType: "starting_from",
    priceUnit: "per_day",
    base: "1,50,000",
  };

  it("converts prices to paise and blanks to null", () => {
    expect(toServiceRow(listingSchema.parse(base))).toMatchObject({
      price_type: "starting_from",
      price_unit: "per_day",
      base_price_paise: 15_000_000,
      max_price_paise: null,
      branch_id: null,
      min_guests: null,
    });
  });

  it("price on request stores no amount", () => {
    expect(
      toServiceRow(listingSchema.parse({ ...base, priceType: "on_request", base: "", priceUnit: "" })),
    ).toMatchObject({
      price_unit: null,
      base_price_paise: null,
    });
  });

  it.each([
    [{ base: "" }, "base", "validation.priceRequired"],
    [{ priceUnit: "" }, "base", "validation.priceRequired"],
    [{ priceType: "range", max: "1000" }, "max", "validation.priceRange"],
    [{ minGuests: "500", maxGuests: "100" }, "maxGuests", "validation.guestRange"],
    [{ title: "Hi" }, "title", "validation.titleLength"],
  ])("rejects %o", (patch, field, key) => {
    expect(errorsOf(listingSchema, { ...base, ...patch })[field]).toBe(key);
  });

  it("maps venue and catering details", () => {
    expect(
      toVenueRow({
        ...base.venue!,
        seated: "800",
        floating: "",
        airConditioned: "yes",
        alcoholAllowed: "",
        cateringPolicy: "both",
      }),
    ).toMatchObject({
      seated_capacity: 800,
      floating_capacity: null,
      air_conditioned: true,
      alcohol_allowed: null,
      catering_policy: "both",
    });
    expect(
      toCateringRow({ ...base.catering!, vegPlate: "250", cuisines: " North Karnataka, South Indian ,," }),
    ).toMatchObject({
      veg_price_per_plate_paise: 25_000,
      nonveg_price_per_plate_paise: null,
      cuisines: ["North Karnataka", "South Indian"],
    });
  });

  it("round-trips a stored listing through the form", () => {
    const stored = {
      id: UUID,
      service_category_id: UUID,
      title: "Main hall",
      summary: null,
      description: "Big",
      booking_mode: "instant" as const,
      branch_id: null,
      city_id: UUID,
      area_id: null,
      price_type: "range" as const,
      price_unit: "per_day",
      base_price_paise: 30_000_000,
      max_price_paise: 60_000_050,
      min_guests: 100,
      max_guests: 2500,
      venue_details: [
        {
          seated_capacity: 1500,
          floating_capacity: 2500,
          dining_capacity: null,
          rooms: 6,
          parking_cars: 250,
          area_sqft: null,
          air_conditioned: true,
          alcohol_allowed: false,
          catering_policy: "in_house_only",
          decor_policy: null,
        },
      ],
      catering_details: null,
    };
    const input = listingToInput(stored);
    expect(input).toMatchObject({
      base: "300000",
      max: "600000.50",
      minGuests: "100",
      venue: { seated: "1500", airConditioned: "yes", alcoholAllowed: "no" },
    });
    const row = toServiceRow(listingSchema.parse(input));
    expect(row).toMatchObject({
      base_price_paise: 30_000_000,
      max_price_paise: 60_000_050,
      booking_mode: "instant",
      min_guests: 100,
      max_guests: 2500,
    });
  });

  it("only allows sensible status changes", () => {
    expect(SERVICE_STATUS_TRANSITIONS.draft).toContain("published");
    expect(SERVICE_STATUS_TRANSITIONS.published).not.toContain("draft");
    expect(SERVICE_STATUS_TRANSITIONS.archived).toEqual(["draft"]);
  });
});

describe("resources", () => {
  const base = {
    name: "Chairs",
    kind: "equipment" as const,
    allocationMode: "capacity" as const,
    capacity: "300",
    serviceId: "",
    branchId: "",
    setupBufferMin: "30",
    breakdownBufferMin: "60",
    travelBufferMin: "0",
  };

  it("keeps capacity for shared resources and forces 1 for exclusive ones", () => {
    expect(toResourceRow(resourceSchema.parse(base))).toMatchObject({
      capacity: 300,
      setup_buffer_min: 30,
      service_id: null,
    });
    expect(toResourceRow(resourceSchema.parse({ ...base, allocationMode: "exclusive", capacity: "" }))).toMatchObject({
      capacity: 1,
    });
  });

  it.each([
    [{ capacity: "0" }, "capacity", "validation.capacity"],
    [{ setupBufferMin: "5000" }, "setupBufferMin", "validation.minutes"],
    [{ name: "" }, "name", "validation.required"],
  ])("rejects %o", (patch, field, key) => {
    expect(errorsOf(resourceSchema, { ...base, ...patch })[field]).toBe(key);
  });
});

describe("team & storage", () => {
  it("normalises invitation emails", () => {
    expect(inviteSchema.parse({ email: "  Ravi@Example.COM ", role: "staff", branchIds: [] }).email).toBe(
      "ravi@example.com",
    );
    expect(errorsOf(inviteSchema, { email: "nope", role: "staff", branchIds: [] }).email).toBe("validation.email");
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "owner", branchIds: [] }).success).toBe(false);
  });

  it.each([
    [`${ORG}/0b6c1c38-4a3e-4c55-9d43-5d0d7b7d3a11.pdf`, true],
    [`${ORG}/0b6c1c38-4a3e-4c55-9d43-5d0d7b7d3a11.webp`, true],
    [`${UUID}/0b6c1c38-4a3e-4c55-9d43-5d0d7b7d3a11.pdf`, false],
    [`${ORG}/../other/0b6c1c38-4a3e-4c55-9d43-5d0d7b7d3a11.pdf`, false],
    [`${ORG}/0b6c1c38-4a3e-4c55-9d43-5d0d7b7d3a11.exe`, false],
    [`${ORG}/photo.jpg`, false],
  ])("isOrgObjectPath(%s) = %s", (path, expected) => {
    expect(isOrgObjectPath(path, ORG)).toBe(expected);
  });
});

describe("auspicious-date surcharge (B)", () => {
  const base: ListingInput = {
    ...emptyListing({ cityId: UUID, branchId: "" }),
    serviceCategoryId: UUID,
    title: "Main hall",
    priceType: "starting_from",
    priceUnit: "per_day",
    base: "100000",
  };
  it("stores the percentage as basis points and round-trips it", () => {
    const row = toServiceRow(listingSchema.parse({ ...base, auspiciousSurcharge: "12.5" }));
    expect(row.auspicious_surcharge_bps).toBe(1250);
    expect(toServiceRow(listingSchema.parse(base)).auspicious_surcharge_bps).toBe(0);
    expect(errorsOf(listingSchema, { ...base, auspiciousSurcharge: "75" }).auspiciousSurcharge).toBe(
      "validation.percent",
    );
  });
});
