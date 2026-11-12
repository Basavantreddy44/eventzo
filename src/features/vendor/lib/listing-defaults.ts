import type { ListingInput } from "../schemas";

const rupees = (paise: number | null | undefined) =>
  paise === null || paise === undefined ? "" : (paise / 100).toFixed(2).replace(/\.00$/, "");
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const tri = (b: boolean | null | undefined): "" | "yes" | "no" =>
  b === null || b === undefined ? "" : b ? "yes" : "no";

type Venue = {
  seated_capacity: number | null;
  floating_capacity: number | null;
  dining_capacity: number | null;
  rooms: number | null;
  parking_cars: number | null;
  area_sqft: number | null;
  air_conditioned: boolean | null;
  alcohol_allowed: boolean | null;
  catering_policy: string | null;
  decor_policy: string | null;
};
type Catering = {
  veg_price_per_plate_paise: number | null;
  nonveg_price_per_plate_paise: number | null;
  cuisines: string[];
  min_plates: number | null;
  max_plates: number | null;
  live_counters: boolean | null;
  service_staff_included: boolean | null;
};

/** PostgREST may embed a 1:1 relation as an object or a one-element array. */
function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export const EMPTY_VENUE: NonNullable<ListingInput["venue"]> = {
  seated: "",
  floating: "",
  dining: "",
  rooms: "",
  parking: "",
  areaSqft: "",
  airConditioned: "",
  alcoholAllowed: "",
  cateringPolicy: "",
  decorPolicy: "",
};

export const EMPTY_CATERING: NonNullable<ListingInput["catering"]> = {
  vegPlate: "",
  nonvegPlate: "",
  cuisines: "",
  minPlates: "",
  maxPlates: "",
  liveCounters: false,
  staffIncluded: true,
};

export function emptyListing(defaults: { cityId: string; branchId: string }): ListingInput {
  return {
    serviceCategoryId: "",
    title: "",
    summary: "",
    description: "",
    bookingMode: "request",
    branchId: defaults.branchId,
    cityId: defaults.cityId,
    areaId: "",
    priceType: "starting_from",
    priceUnit: "",
    base: "",
    max: "",
    minGuests: "",
    maxGuests: "",
    auspiciousSurcharge: "",
    advancePercent: "25",
    cancellationPolicy: "moderate",
    venue: EMPTY_VENUE,
    catering: EMPTY_CATERING,
  };
}

/** Database row (with embedded details) → form values. */
export function listingToInput(row: {
  id: string;
  service_category_id: string;
  title: string;
  summary: string | null;
  description: string | null;
  booking_mode: "request" | "instant";
  branch_id: string | null;
  city_id: string;
  area_id: string | null;
  price_type: ListingInput["priceType"];
  price_unit: string | null;
  base_price_paise: number | null;
  max_price_paise: number | null;
  min_guests: number | null;
  max_guests: number | null;
  auspicious_surcharge_bps?: number | null;
  advance_bps?: number | null;
  cancellation_policy?: ListingInput["cancellationPolicy"] | null;
  venue_details: Venue | Venue[] | null;
  catering_details: Catering | Catering[] | null;
}): ListingInput {
  const v = one(row.venue_details);
  const c = one(row.catering_details);
  return {
    id: row.id,
    serviceCategoryId: row.service_category_id,
    title: row.title,
    summary: row.summary ?? "",
    description: row.description ?? "",
    bookingMode: row.booking_mode,
    branchId: row.branch_id ?? "",
    cityId: row.city_id,
    areaId: row.area_id ?? "",
    priceType: row.price_type,
    priceUnit: (row.price_unit ?? "") as ListingInput["priceUnit"],
    base: rupees(row.base_price_paise),
    max: rupees(row.max_price_paise),
    minGuests: str(row.min_guests),
    maxGuests: str(row.max_guests),
    auspiciousSurcharge: row.auspicious_surcharge_bps ? String(row.auspicious_surcharge_bps / 100) : "",
    advancePercent: String(Math.round((row.advance_bps ?? 2500) / 100)),
    cancellationPolicy: row.cancellation_policy ?? "moderate",
    venue: v
      ? {
          seated: str(v.seated_capacity),
          floating: str(v.floating_capacity),
          dining: str(v.dining_capacity),
          rooms: str(v.rooms),
          parking: str(v.parking_cars),
          areaSqft: str(v.area_sqft),
          airConditioned: tri(v.air_conditioned),
          alcoholAllowed: tri(v.alcohol_allowed),
          cateringPolicy: (v.catering_policy ?? "") as NonNullable<ListingInput["venue"]>["cateringPolicy"],
          decorPolicy: (v.decor_policy ?? "") as NonNullable<ListingInput["venue"]>["decorPolicy"],
        }
      : EMPTY_VENUE,
    catering: c
      ? {
          vegPlate: rupees(c.veg_price_per_plate_paise),
          nonvegPlate: rupees(c.nonveg_price_per_plate_paise),
          cuisines: c.cuisines.join(", "),
          minPlates: str(c.min_plates),
          maxPlates: str(c.max_plates),
          liveCounters: !!c.live_counters,
          staffIncluded: c.service_staff_included ?? true,
        }
      : EMPTY_CATERING,
  };
}
