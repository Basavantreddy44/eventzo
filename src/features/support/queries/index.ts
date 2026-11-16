import "server-only";

import { createClient } from "@/lib/supabase/server";

const TICKET_FIELDS =
  "id, ref_no, customer_id, booking_item_id, organization_id, topic, status, priority, assigned_to, sla_due_at, first_response_at, resolved_at, created_at, updated_at";

/** The signed-in customer's own requests (RLS). */
export async function getMyTickets() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_tickets")
    .select(`${TICKET_FIELDS}, booking_items(snapshot)`)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

/** One ticket with its messages. Internal notes are only returned to agents (RLS). */
export async function getTicket(id: string) {
  const supabase = await createClient();
  const [{ data: ticket }, { data: messages }] = await Promise.all([
    supabase.from("support_tickets").select(`${TICKET_FIELDS}, booking_items(snapshot)`).eq("id", id).maybeSingle(),
    supabase
      .from("support_messages")
      .select("id, author_id, side, internal, body, created_at")
      .eq("ticket_id", id)
      .order("created_at"),
  ]);
  return ticket ? { ticket, messages: messages ?? [] } : null;
}

export type QueueFilter = "active" | "overdue" | "mine" | "closed" | "all";

/** Support desk queue: the most urgent first (reply target, then age). */
export async function getSupportQueue(filter: QueueFilter, userId: string) {
  const supabase = await createClient();
  let query = supabase
    .from("support_tickets")
    .select(`${TICKET_FIELDS}, profiles!support_tickets_customer_id_fkey(full_name), organizations(name)`)
    .order("sla_due_at", { ascending: true })
    .limit(200);
  if (filter === "active" || filter === "overdue") query = query.not("status", "in", "(resolved,closed)");
  if (filter === "overdue") query = query.is("first_response_at", null).lt("sla_due_at", new Date().toISOString());
  if (filter === "mine") query = query.eq("assigned_to", userId).not("status", "in", "(resolved,closed)");
  if (filter === "closed") query = query.in("status", ["resolved", "closed"]);
  const { data } = await query;
  return data ?? [];
}

export type TicketContext = {
  customer: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  booking: {
    id: string;
    status: string;
    event_date: string;
    period: string;
    guests: number | null;
    total_paise: number;
    advance_paise: number;
    paid_paise: number;
    refund_due_paise: number;
    balance_due_on: string;
    currency: string;
    cancellation_policy: string;
    cancel_reason: string | null;
    cancelled_by_side: string | null;
    enquiry_id: string;
    listing: string | null;
    vendor: string | null;
    vendor_id: string | null;
    vendor_phone: string | null;
    vendor_email: string | null;
  } | null;
  payments: {
    id: string;
    kind: string;
    method: string;
    status: string;
    amount_paise: number;
    paid_at: string | null;
    created_at: string;
  }[];
  refunds: { id: string; status: string; amount_paise: number; created_at: string }[];
  vendor_messages: { side: string; body: string; created_at: string }[];
  history: { at: string; action: string; fields: string[] | null; status: string | null; actor: string | null }[];
};

/** Agents: booking, vendor chat, payments, refunds and the ticket's audit trail in one call. */
export async function getTicketContext(id: string): Promise<TicketContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("support_ticket_context", { p_ticket_id: id });
  if (error || !data) return null;
  return data as unknown as TicketContext;
}

export async function getSupportAgents() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("support_agents");
  return data ?? [];
}

/** The customer's open request for a booking, if any (the Help card links to it). */
export async function getOpenTicketForItem(itemId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_tickets")
    .select("id, ref_no, status")
    .eq("booking_item_id", itemId)
    .not("status", "in", "(resolved,closed)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
