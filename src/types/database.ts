/**
 * App-facing database types.
 *
 * `Database` and the table/enum shapes come from `database.generated.ts`,
 * generated from the real schema. After any migration, regenerate with:
 *
 *   npm run db:types
 *
 * This file only adds friendly aliases and types for jsonb-returning RPCs.
 */
import type { Database, Enums, Json, Tables } from "./database.generated";

export type { Database, Json };

// ---------- enums ------------------------------------------------------------
export type AppLocaleEnum = Enums<"app_locale">;
export type OrgRole = Enums<"org_role">;
export type MemberStatus = Enums<"member_status">;
export type OrganizationStatus = Enums<"organization_status">;
export type VerificationStatus = Enums<"verification_status">;
export type DocumentStatus = Enums<"document_status">;
export type ResourceKind = Enums<"resource_kind">;
export type AllocationMode = Enums<"allocation_mode">;
export type ReservationStatus = Enums<"reservation_status">;
export type ReservationSource = Enums<"reservation_source">;
export type BookingMode = Enums<"booking_mode">;
export type ServiceStatus = Enums<"service_status">;
export type PriceType = Enums<"price_type">;
export type PriceUnit = Enums<"price_unit">;
export type OutsidePolicy = Enums<"outside_policy">;
export type BudgetUnit = Enums<"budget_unit">;
export type CancellationPolicy = Enums<"cancellation_policy">;
export type BookingItemStatus = Enums<"booking_item_status">;
export type PaymentMethod = Enums<"payment_method">;
export type PaymentStatus = Enums<"payment_status">;
export type OfflinePaymentMode = Enums<"offline_payment_mode">;
export type RefundStatus = Enums<"refund_status">;
export type EventStatus = Enums<"event_status">;
export type EventRole = Enums<"event_role">;
export type RsvpStatus = Enums<"rsvp_status">;
export type DeliveryStatus = Enums<"delivery_status">;
export type JobAssignmentStatus = Enums<"job_assignment_status">;
export type ExpenseCategory = Enums<"expense_category">;

// ---------- rows -------------------------------------------------------------
export type ProfileRow = Tables<"profiles">;
export type OrganizationRow = Tables<"organizations">;
export type OrganizationMemberRow = Tables<"organization_members">;
export type BranchRow = Tables<"branches">;
export type BusinessProfileRow = Tables<"business_profiles">;
export type BusinessDocumentRow = Tables<"business_documents">;
export type BusinessCategoryRow = Tables<"business_categories">;
export type ServiceCategoryRow = Tables<"service_categories">;
export type CityRow = Tables<"cities">;
export type BookableResourceRow = Tables<"bookable_resources">;
export type ResourceReservationRow = Tables<"resource_reservations">;
export type AuditLogRow = Tables<"audit_logs">;
export type ServiceRow = Tables<"services">;
export type AuspiciousDateRow = Tables<"auspicious_dates">;
export type BudgetBenchmarkRow = Tables<"budget_benchmarks">;
export type StaffProfileRow = Tables<"staff_profiles">;
export type JobRow = Tables<"jobs">;
export type JobAssignmentRow = Tables<"job_assignments">;
export type VendorExpenseRow = Tables<"vendor_expenses">;

/** One row of `search_listings()`. */
export type ListingSummary = Database["public"]["Functions"]["search_listings"]["Returns"][number];

// ---------- jsonb-returning RPCs (shape defined in SQL) ----------------------
/** `my_access()` — see supabase/migrations/20261110001000_rpc.sql */
export type MyAccess = {
  user_id: string;
  roles: string[];
  permissions: string[];
  memberships: {
    organization_id: string;
    organization_name: string;
    organization_slug: string;
    organization_status: OrganizationStatus;
    verification_status: VerificationStatus;
    role: OrgRole;
  }[];
};

/** `get_listing(slug)` — see supabase/migrations/20261111000100_listings.sql */
export type ListingDetail = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  booking_mode: BookingMode;
  price_type: PriceType;
  price_unit: PriceUnit | null;
  base_price_paise: number | null;
  max_price_paise: number | null;
  currency: string;
  min_guests: number | null;
  max_guests: number | null;
  attributes: Record<string, Json>;
  published_at: string | null;
  category: {
    slug: string;
    name: string;
    name_i18n: Json;
    business_slug: string;
    business_name: string;
    business_name_i18n: Json;
    icon: string | null;
  };
  location: { city_slug: string; city: string; city_i18n: Json; state: string; area: string | null; timezone: string };
  vendor: {
    name: string;
    verified: boolean;
    tagline: string | null;
    about: string | null;
    year_established: number | null;
    languages: AppLocaleEnum[];
  };
  venue: {
    seated_capacity: number | null;
    floating_capacity: number | null;
    dining_capacity: number | null;
    rooms: number | null;
    parking_cars: number | null;
    area_sqft: number | null;
    air_conditioned: boolean | null;
    catering_policy: OutsidePolicy | null;
    decor_policy: OutsidePolicy | null;
    alcohol_allowed: boolean | null;
  } | null;
  catering: {
    veg_price_per_plate_paise: number | null;
    nonveg_price_per_plate_paise: number | null;
    cuisines: string[];
    min_plates: number | null;
    max_plates: number | null;
    live_counters: boolean | null;
    service_staff_included: boolean | null;
  } | null;
  media: { path: string; alt: string | null; is_cover: boolean }[];
};
