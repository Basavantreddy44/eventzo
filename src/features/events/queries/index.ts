import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { EventRole } from "@/types/database";

/** Events are read with the user's session: RLS limits rows to the event's members. */
const EVENT_FIELDS =
  "id, owner_id, title, event_type, city_id, start_date, end_date, guest_estimate, status, hosts_text, venue_text, invitation_message, currency, created_at";

export async function listMyEvents(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(`${EVENT_FIELDS}, event_members!inner(role)`)
    .eq("event_members.user_id", userId)
    .order("start_date")
    .limit(100);
  if (error) throw new Error(`Failed to load events: ${error.message}`);
  return (data ?? []).map(({ event_members, ...e }) => ({ ...e, role: event_members[0]?.role as EventRole }));
}

/** Events the user owns (for filing an enquiry under one). */
export async function listOwnedEvents(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, start_date, status")
    .eq("owner_id", userId)
    .neq("status", "cancelled")
    .order("start_date")
    .limit(100);
  if (error) throw new Error(`Failed to load events: ${error.message}`);
  return data ?? [];
}

/** One event with the caller's role. Null when not visible. */
export async function getEvent(eventId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(`${EVENT_FIELDS}, event_members!inner(role)`)
    .eq("id", eventId)
    .eq("event_members.user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load event: ${error.message}`);
  if (!data) return null;
  const { event_members, ...event } = data;
  return { event, role: event_members[0]?.role as EventRole };
}

export async function getEventVendors(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("event_vendors", { p_event_id: eventId });
  if (error) throw new Error(`Failed to load event vendors: ${error.message}`);
  return data ?? [];
}

export async function listGuests(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_guests")
    .select(
      "id, name, phone, email, group_label, party_size, rsvp_status, attending_count, rsvp_note, responded_at, invited_at, created_at",
    )
    .eq("event_id", eventId)
    .order("group_label", { nullsFirst: false })
    .order("name")
    .limit(2000);
  if (error) throw new Error(`Failed to load guests: ${error.message}`);
  return data ?? [];
}

export async function listBudgetLines(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_budget_lines")
    .select("id, business_category_id, label, planned_paise")
    .eq("event_id", eventId)
    .order("created_at");
  if (error) throw new Error(`Failed to load budget: ${error.message}`);
  return data ?? [];
}

export async function listMembers(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("event_member_directory", { p_event_id: eventId });
  if (error) throw new Error(`Failed to load members: ${error.message}`);
  return data ?? [];
}

/** Owner: open invitations for this event. */
export async function listEventInvitations(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_invitations")
    .select("id, email, role, status, expires_at, created_at")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load invitations: ${error.message}`);
  return data ?? [];
}

export async function myEventInvitations() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_event_invitations");
  if (error) throw new Error(`Failed to load invitations: ${error.message}`);
  return data ?? [];
}

/** Public RSVP page: the invitation behind a guest link (anon-safe RPC). */
export async function getInvitationByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invitation_by_token", { p_token: token });
  if (error) throw new Error(`Failed to load invitation: ${error.message}`);
  return data?.[0] ?? null;
}
