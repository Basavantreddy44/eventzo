import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/**
 * Bookings are read with the user's session: RLS limits rows to the customer,
 * the vendor's owners/branch managers, or finance.
 */
const ITEM_FIELDS =
  "id, booking_id, enquiry_id, quotation_id, customer_id, organization_id, branch_id, service_id, reservation_id, event_date, period, guests, status, currency, total_paise, advance_bps, advance_paise, paid_paise, refund_due_paise, cancellation_policy, snapshot, payment_due_at, confirmed_at, cancelled_at, cancelled_by_side, cancel_reason, created_at";

export type BookingSnapshot = {
  listing?: { title?: string; slug?: string; vendor_name?: string };
  quotation?: {
    version: number;
    subtotal_paise: number;
    discount_paise: number;
    tax_bps: number;
    tax_paise: number;
    total_paise: number;
    notes: string | null;
    terms: string | null;
    items: { description: string; quantity: number; unit_price_paise: number; amount_paise: number }[];
  } | null;
};

export const bookingSnapshotOf = (v: Json): BookingSnapshot =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as BookingSnapshot) : {};

export async function listMyBookings(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_items")
    .select(ITEM_FIELDS)
    .eq("customer_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Failed to load bookings: ${error.message}`);
  return data ?? [];
}

export async function listOrgBookings(organizationId: string, upcomingOnly: boolean) {
  const supabase = await createClient();
  let q = supabase
    .from("booking_items")
    .select(ITEM_FIELDS)
    .eq("organization_id", organizationId)
    .order("event_date", { ascending: true })
    .limit(200);
  if (upcomingOnly) q = q.in("status", ["pending_payment", "confirmed"]);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load bookings: ${error.message}`);
  return data ?? [];
}

/** One booking item with its payments and refunds. Null when not visible. */
export async function getBookingItem(itemId: string) {
  const supabase = await createClient();
  // One statement = one consistent snapshot: the paid total always matches the payments listed.
  const { data, error } = await supabase
    .from("booking_items")
    .select(
      `${ITEM_FIELDS},
       payments(id, kind, method, status, amount_paise, currency, offline_mode, reference, note, paid_at, created_at, razorpay_payment_id, receipt_number),
       refunds(id, method, amount_paise, currency, status, reference, reason, processed_at, created_at)`,
    )
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load booking: ${error.message}`);
  if (!data) return null;
  const { payments, refunds, ...item } = data;
  const byCreated = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at);
  return {
    item,
    // Unpaid online attempts ("created") are noise for people.
    payments: (payments ?? []).filter((p) => p.status !== "created").sort(byCreated),
    refunds: [...(refunds ?? [])].sort(byCreated),
  };
}

export async function getBookingForEnquiry(enquiryId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("booking_items").select("id, status").eq("enquiry_id", enquiryId).maybeSingle();
  return data;
}

/** Customer: what booking an accepted quote / instant reservation would cost. Null when it can't be booked. */
export async function getBookingPreview(enquiryId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_preview", { p_enquiry_id: enquiryId });
  if (error) return { preview: null, error: error.message };
  return { preview: data?.[0] ?? null, error: null };
}

/** Refund the caller would get by cancelling now. */
export async function getCancellationQuote(itemId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cancellation_quote", { p_booking_item_id: itemId });
  return data?.[0] ?? null;
}

/** Finance: refunds waiting to be issued (and recent ones). */
export async function listRefunds(pendingOnly: boolean) {
  const supabase = await createClient();
  let q = supabase
    .from("refunds")
    .select(
      "id, booking_item_id, method, amount_paise, currency, status, reference, reason, created_at, processed_at, organizations(name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (pendingOnly) q = q.in("status", ["pending", "processing", "failed"]);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load refunds: ${error.message}`);
  return data ?? [];
}
