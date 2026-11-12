import "server-only";

import { createClient } from "@/lib/supabase/server";
import { zonedToIso } from "@/features/enquiries/schemas";
import { bookingSnapshotOf } from "@/features/bookings/queries";

/**
 * Vendor finance reads. All run with the user's session: RLS limits rows to
 * the owner's organisation, or a branch manager's branches.
 */

export type ReportTotals = {
  enquiries: number;
  quoted: number;
  bookings: number;
  confirmed_jobs: number;
  booked_value_paise: number;
  received_paise: number;
  refunded_paise: number;
  expenses_paise: number;
  outstanding_paise: number;
};
export type VendorReport = {
  from: string;
  to: string;
  days: number;
  totals: ReportTotals;
  monthly: {
    month: string;
    booked_value_paise: number;
    received_paise: number;
    refunded_paise: number;
    expenses_paise: number;
  }[];
  expenses_by_category: { category: string; amount_paise: number }[];
  listings: { service_id: string; title: string; enquiries: number; confirmed: number; booked_value_paise: number }[];
  resources: { resource_id: string; name: string; kind: string; booked_days: number; blocked_days: number }[];
  staff: {
    staff_profile_id: string;
    name: string;
    skill: string | null;
    jobs: number;
    completed: number;
    declined: number;
    pay_paise: number;
    paid_out_paise: number;
  }[];
};

export async function getVendorReport(organizationId: string, from: string, to: string): Promise<VendorReport> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vendor_report", {
    p_organization_id: organizationId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(`Failed to load report: ${error.message}`);
  return data as unknown as VendorReport;
}

export async function listExpenses(organizationId: string, branchId: string | null, from: string, to: string) {
  const supabase = await createClient();
  let q = supabase
    .from("vendor_expenses")
    .select(
      "id, category, amount_paise, currency, spent_on, payee, mode, reference, note, branch_id, booking_item_id, assignment_id, created_at",
    )
    .eq("organization_id", organizationId)
    .gte("spent_on", from)
    .lte("spent_on", to)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (branchId) q = q.eq("branch_id", branchId);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load expenses: ${error.message}`);
  return data ?? [];
}

/** Confirmed bookings that still have money to collect, soonest first. */
export async function listReceivables(organizationId: string, branchId: string | null) {
  const supabase = await createClient();
  let q = supabase
    .from("booking_items")
    .select("id, event_date, total_paise, paid_paise, currency, snapshot, branch_id")
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .order("event_date", { ascending: true })
    .limit(500);
  if (branchId) q = q.eq("branch_id", branchId);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load receivables: ${error.message}`);
  return (data ?? [])
    .filter((b) => b.paid_paise < b.total_paise)
    .map((b) => ({
      id: b.id,
      eventDate: b.event_date,
      title: bookingSnapshotOf(b.snapshot).listing?.title ?? "—",
      total: b.total_paise,
      paid: b.paid_paise,
      due: b.total_paise - b.paid_paise,
      currency: b.currency,
    }));
}

/** Payments received between two IST dates (inclusive), newest first. */
export async function listReceivedPayments(organizationId: string, branchId: string | null, from: string, to: string) {
  const supabase = await createClient();
  const start = zonedToIso(from, "00:00");
  const end = new Date(new Date(zonedToIso(to, "00:00")).getTime() + 86_400_000).toISOString();
  let q = supabase
    .from("payments")
    .select(
      "id, kind, method, offline_mode, amount_paise, currency, paid_at, receipt_number, reference, booking_items!inner(id, branch_id, snapshot, event_date)",
    )
    .eq("organization_id", organizationId)
    .eq("status", "paid")
    .gte("paid_at", start)
    .lt("paid_at", end)
    .order("paid_at", { ascending: false })
    .limit(500);
  if (branchId) q = q.eq("booking_items.branch_id", branchId);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load payments: ${error.message}`);
  return (data ?? []).map((p) => {
    const item = p.booking_items as unknown as { id: string; snapshot: unknown; event_date: string };
    return {
      ...p,
      bookingItemId: item.id,
      eventDate: item.event_date,
      title: bookingSnapshotOf(item.snapshot as never).listing?.title ?? "—",
    };
  });
}

export type Receipt = {
  receipt_number: string | null;
  paid_at: string;
  amount_paise: number;
  currency: string;
  kind: "advance" | "balance";
  method: "razorpay" | "offline";
  offline_mode: string | null;
  gateway_payment_id: string | null;
  reference: string | null;
  refunded_paise: number;
  viewer_is_customer: boolean;
  booking: {
    id: string;
    enquiry_id: string;
    listing: string | null;
    event_date: string;
    period: string;
    total_paise: number;
    paid_to_date_paise: number;
    balance_after_paise: number;
    status: string;
  };
  vendor: {
    name: string;
    legal_name: string | null;
    gstin: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  customer: { name: string | null; phone: string | null; email: string | null };
};

/** Null when the payment isn't paid or the caller may not see it. */
export async function getReceipt(paymentId: string): Promise<Receipt | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("payment_receipt", { p_payment_id: paymentId });
  if (error) {
    if (error.code === "P0002") return null;
    throw new Error(`Failed to load receipt: ${error.message}`);
  }
  return data as unknown as Receipt;
}
