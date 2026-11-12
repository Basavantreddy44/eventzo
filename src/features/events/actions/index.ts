"use server";

import { z } from "zod";
import { getLocale } from "next-intl/server";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { getPublicEnv } from "@/lib/env";
import { rupeesToPaise } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";
import { toFieldErrors } from "@/features/auth/schemas";
import { normalizePhone } from "@/features/account/schemas";
import { estimateBudget } from "@/features/budget/lib/estimate";
import { getPublishedBenchmarks } from "@/features/budget/queries";
import { inviteUrl } from "../lib/guests";
import { plannedFromRange } from "../lib/budget";
import {
  budgetLineSchema,
  budgetPlannedSchema,
  createEventSchema,
  eventDetailsSchema,
  guestSchema,
  hostRsvpSchema,
  inviteMemberSchema,
  MAX_BULK_GUESTS,
  parseGuestLines,
  type BudgetLineInput,
  type BudgetPlannedInput,
  type CreateEventInput,
  type EventDetailsInput,
  type GuestInput,
  type HostRsvpInput,
  type InviteMemberInput,
} from "../schemas";

const NULL = null as unknown as string; // SQL accepts NULL for optional RPC arguments
const dbFail = (error: { code?: string } | null) => fail(`errors.${mapDbError(error)}`);
const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;

async function userId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, uid: data.user?.id ?? null };
}

export async function createEvent(input: CreateEventInput): Promise<ActionResult<string>> {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_event", {
    p_title: v.title,
    p_event_type: v.eventType,
    p_city_id: v.cityId || NULL,
    p_start_date: v.startDate,
    p_end_date: v.endDate || NULL,
    p_guest_estimate: v.guestEstimate ? Number(v.guestEstimate) : (null as unknown as number),
    p_idempotency_key: v.idempotencyKey,
  });
  if (error) {
    if (error.code === "22023") return fail("errors.invalidInput", { startDate: "validation.eventStart" });
    return dbFail(error);
  }
  return ok(data as string);
}

export async function updateEventDetails(input: EventDetailsInput): Promise<ActionResult> {
  const parsed = eventDetailsSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .update({
      title: v.title,
      event_type: v.eventType,
      city_id: v.cityId || null,
      start_date: v.startDate,
      end_date: v.endDate || v.startDate,
      guest_estimate: v.guestEstimate ? Number(v.guestEstimate) : null,
      hosts_text: v.hostsText || null,
      venue_text: v.venueText || null,
      invitation_message: v.invitationMessage || null,
    })
    .eq("id", v.eventId)
    .select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("errors.forbidden");
  return ok(undefined);
}

export async function setEventStatus(
  eventId: string,
  status: "planning" | "completed" | "cancelled",
): Promise<ActionResult> {
  if (!isUuid(eventId) || !["planning", "completed", "cancelled"].includes(status)) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_event_status", { p_event_id: eventId, p_status: status });
  return error ? dbFail(error) : ok(undefined);
}

// ---------- people ---------------------------------------------------------------------
export async function inviteEventMember(input: InviteMemberInput): Promise<ActionResult> {
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_event_member", {
    p_event_id: parsed.data.eventId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error?.code === "23505") return fail("errors.invalidInput", { email: "events.alreadyMember" });
  return error ? dbFail(error) : ok(undefined);
}

export async function revokeEventInvitation(invitationId: string): Promise<ActionResult> {
  if (!isUuid(invitationId)) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_event_invitation", { p_invitation_id: invitationId });
  return error ? dbFail(error) : ok(undefined);
}

export async function respondEventInvitation(invitationId: string, accept: boolean): Promise<ActionResult<string>> {
  if (!isUuid(invitationId)) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_event_invitation", {
    p_invitation_id: invitationId,
    p_accept: accept,
  });
  if (error) return fail(error.code === "22023" ? "events.invitationClosed" : `errors.${mapDbError(error)}`);
  return ok(data as string);
}

export async function removeEventMember(eventId: string, memberUserId: string): Promise<ActionResult> {
  if (!isUuid(eventId) || !isUuid(memberUserId)) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_event_member", { p_event_id: eventId, p_user_id: memberUserId });
  return error ? dbFail(error) : ok(undefined);
}

// ---------- vendors --------------------------------------------------------------------
/** Files one of the customer's enquiries (and its booking) under an event; "" removes it. */
export async function setEnquiryEvent(enquiryId: string, eventId: string): Promise<ActionResult> {
  if (!isUuid(enquiryId) || (eventId !== "" && !isUuid(eventId))) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_enquiry_event", { p_enquiry_id: enquiryId, p_event_id: eventId || NULL });
  return error ? dbFail(error) : ok(undefined);
}

// ---------- guests ---------------------------------------------------------------------
export async function addGuest(input: GuestInput): Promise<ActionResult> {
  const parsed = guestSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const v = parsed.data;
  const { supabase, uid } = await userId();
  if (!uid) return fail("errors.unauthenticated");
  const { error } = await supabase.from("event_guests").insert({
    event_id: v.eventId,
    name: v.name,
    phone: v.phone ? normalizePhone(v.phone) : null,
    email: v.email || null,
    group_label: v.groupLabel || null,
    party_size: Number(v.partySize),
    created_by: uid,
  });
  return error ? dbFail(error) : ok(undefined);
}

/** Bulk paste: "Name, phone, party size" per line. All-or-nothing. */
export async function addGuestsBulk(eventId: string, text: string, groupLabel: string): Promise<ActionResult<number>> {
  if (!isUuid(eventId) || typeof text !== "string" || text.length > 40_000) return fail("errors.invalidInput");
  const group = (groupLabel ?? "").trim();
  if (group.length > 60) return fail("errors.invalidInput", { groupLabel: "validation.tooLong" });
  const { guests, invalidLines } = parseGuestLines(text);
  if (invalidLines.length) return fail("events.bulkInvalid", { text: "events.bulkInvalid" });
  if (guests.length === 0) return fail("errors.invalidInput", { text: "validation.required" });
  if (guests.length > MAX_BULK_GUESTS) return fail("errors.invalidInput", { text: "events.bulkTooMany" });
  const { supabase, uid } = await userId();
  if (!uid) return fail("errors.unauthenticated");
  const { error } = await supabase.from("event_guests").insert(
    guests.map((g) => ({
      event_id: eventId,
      name: g.name,
      phone: g.phone,
      party_size: g.partySize,
      group_label: group || null,
      created_by: uid,
    })),
  );
  return error ? dbFail(error) : ok(guests.length);
}

/** Host records an RSVP they received by phone or in person. */
export async function setGuestRsvp(input: HostRsvpInput): Promise<ActionResult> {
  const parsed = hostRsvpSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_guests")
    .update({ rsvp_status: v.status, attending_count: v.status === "declined" || v.status === "pending" ? 0 : v.count })
    .eq("id", v.guestId)
    .select("id");
  if (error) return error.code === "23514" ? fail("events.countTooHigh") : dbFail(error);
  if (!data?.length) return fail("errors.forbidden");
  return ok(undefined);
}

export async function deleteGuest(guestId: string): Promise<ActionResult> {
  if (!isUuid(guestId)) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_guests").delete().eq("id", guestId).select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("errors.forbidden");
  return ok(undefined);
}

/** Editors: the guest's private RSVP link (regenerate revokes the old one). */
export async function getGuestInviteLink(guestId: string, regenerate = false): Promise<ActionResult<string>> {
  if (!isUuid(guestId)) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("guest_invite_token", { p_guest_id: guestId, p_regenerate: regenerate });
  if (error || !data) return dbFail(error);
  const locale = await getLocale();
  return ok(inviteUrl(getPublicEnv().NEXT_PUBLIC_SITE_URL, locale, data, routing.defaultLocale));
}

export async function markGuestInvited(guestId: string): Promise<ActionResult> {
  if (!isUuid(guestId)) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_guests_invited", { p_guest_ids: [guestId] });
  return error ? dbFail(error) : ok(undefined);
}

// ---------- budget ---------------------------------------------------------------------
export async function addBudgetLine(input: BudgetLineInput): Promise<ActionResult> {
  const parsed = budgetLineSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("event_budget_lines").insert({
    event_id: v.eventId,
    business_category_id: v.categoryId || null,
    label: v.categoryId ? null : v.label,
    planned_paise: Number(rupeesToPaise(v.planned)),
  });
  if (error?.code === "23505") return fail("errors.invalidInput", { label: "events.budgetDuplicate" });
  return error ? dbFail(error) : ok(undefined);
}

export async function updateBudgetPlanned(input: BudgetPlannedInput): Promise<ActionResult> {
  const parsed = budgetPlannedSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_budget_lines")
    .update({ planned_paise: Number(rupeesToPaise(parsed.data.planned)) })
    .eq("id", parsed.data.lineId)
    .select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("errors.forbidden");
  return ok(undefined);
}

export async function deleteBudgetLine(lineId: string): Promise<ActionResult> {
  if (!isUuid(lineId)) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_budget_lines").delete().eq("id", lineId).select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("errors.forbidden");
  return ok(undefined);
}

/**
 * Adds a planned line (estimator midpoint for the event's city and guest count)
 * for every category with a published range in that city and no line yet.
 */
export async function fillBudgetFromEstimate(eventId: string): Promise<ActionResult<number>> {
  if (!isUuid(eventId)) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, guest_estimate, cities(slug)")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return fail("errors.notFound");
  if (!event.cities?.slug || !event.guest_estimate) return fail("events.estimateNeedsCity");

  const [benchmarks, categories, lines] = await Promise.all([
    getPublishedBenchmarks(),
    supabase.from("business_categories").select("id, slug").eq("active", true),
    supabase.from("event_budget_lines").select("business_category_id").eq("event_id", eventId),
  ]);
  const citySlug = event.cities.slug;
  const forCity = benchmarks.filter((b) => b.citySlug === citySlug);
  const estimate = estimateBudget({
    guests: event.guest_estimate,
    categories: forCity.map((b) => b.categorySlug),
    benchmarks: forCity,
  });
  const have = new Set((lines.data ?? []).map((l) => l.business_category_id));
  const idBySlug = new Map((categories.data ?? []).map((c) => [c.slug as string, c.id]));
  const rows = estimate.lines.flatMap((l) => {
    const id = idBySlug.get(l.categorySlug);
    return l.available && id && !have.has(id)
      ? [{ event_id: eventId, business_category_id: id, planned_paise: plannedFromRange(l.lowPaise, l.highPaise) }]
      : [];
  });
  if (rows.length === 0) return fail("events.estimateNothing");
  const { error } = await supabase.from("event_budget_lines").insert(rows);
  return error ? dbFail(error) : ok(rows.length);
}
