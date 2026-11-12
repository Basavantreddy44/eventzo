import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseTstzRange } from "@/lib/datetime";
import type { Json } from "@/types/database";

/** Enquiries/quotes are read with the user's session: RLS limits rows to the customer or the vendor managers. */

export type PriceSnapshot = {
  title?: string;
  slug?: string;
  vendor_name?: string;
  price_type?: string;
  price_unit?: string | null;
  base_price_paise?: number | null;
  max_price_paise?: number | null;
  currency?: string;
  auspicious?: boolean;
  surcharge_bps?: number;
};

export const snapshotOf = (v: Json): PriceSnapshot =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as PriceSnapshot) : {};
export const rangeOf = (period: unknown) => parseTstzRange(String(period));

const ENQUIRY_FIELDS =
  "id, organization_id, service_id, customer_id, event_id, event_date, period, guests, message, status, booking_mode, reservation_id, hold_expires_at, price_snapshot, created_at";

export async function listMyEnquiries(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enquiries")
    .select(ENQUIRY_FIELDS)
    .eq("customer_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Failed to load enquiries: ${error.message}`);
  return data ?? [];
}

export async function listOrgEnquiries(organizationId: string, activeOnly: boolean) {
  const supabase = await createClient();
  let q = supabase
    .from("enquiries")
    .select(`${ENQUIRY_FIELDS}, services(title)`)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (activeOnly) q = q.in("status", ["open", "quoted", "accepted", "reserved"]);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load enquiries: ${error.message}`);
  return data ?? [];
}

/** One enquiry with its quotations (and lines) and messages. Null when not visible. */
export async function getEnquiryThread(enquiryId: string) {
  const supabase = await createClient();
  const { data: enquiry, error } = await supabase
    .from("enquiries")
    .select(ENQUIRY_FIELDS)
    .eq("id", enquiryId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load enquiry: ${error.message}`);
  if (!enquiry) return null;

  const [quotes, messages] = await Promise.all([
    supabase
      .from("quotations")
      .select("*, quotation_items(description, quantity, unit_price_paise, amount_paise, sort_order)")
      .eq("enquiry_id", enquiryId)
      .order("version", { ascending: false }),
    supabase
      .from("enquiry_messages")
      .select("id, sender_id, sender_side, body, created_at")
      .eq("enquiry_id", enquiryId)
      .order("created_at"),
  ]);
  if (quotes.error) throw new Error(`Failed to load quotations: ${quotes.error.message}`);
  if (messages.error) throw new Error(`Failed to load messages: ${messages.error.message}`);

  return {
    enquiry,
    quotes: (quotes.data ?? []).map((q) => ({
      ...q,
      quotation_items: [...(q.quotation_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    })),
    messages: messages.data ?? [],
  };
}

export async function getEnquiryContact(enquiryId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("enquiry_contact", { p_enquiry_id: enquiryId });
  return data?.[0] ?? null;
}

/** Calendar: active reservations of the org's resources overlapping [from, to). */
export async function getCalendarReservations(
  organizationId: string,
  resourceIds: string[],
  fromIso: string,
  toIso: string,
) {
  if (resourceIds.length === 0) return [];
  const supabase = await createClient();
  const [res, enq] = await Promise.all([
    supabase
      .from("resource_reservations")
      .select("id, resource_id, period, status, source, notes, hold_expires_at")
      .eq("organization_id", organizationId)
      .in("resource_id", resourceIds)
      .in("status", ["hold", "confirmed", "blocked"])
      .overlaps("period", `[${fromIso},${toIso})`)
      .order("period"),
    supabase
      .from("enquiries")
      .select("id, reservation_id")
      .eq("organization_id", organizationId)
      .not("reservation_id", "is", null),
  ]);
  if (res.error) throw new Error(`Failed to load calendar: ${res.error.message}`);
  const enquiryByReservation = new Map((enq.data ?? []).map((e) => [e.reservation_id, e.id]));
  return (res.data ?? []).map((r) => ({ ...r, enquiryId: enquiryByReservation.get(r.id) ?? null }));
}
