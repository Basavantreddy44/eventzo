"use server";

import { z } from "zod";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { requireVendorActor } from "@/features/vendor/lib/actor";
import {
  calendarEntrySchema,
  quoteSchema,
  toQuotationArgs,
  zonedToIso,
  type CalendarEntryInput,
  type QuoteInput,
} from "../schemas";

const MANAGERS = ["owner", "branch_manager"] as const;

export async function declineEnquiry(enquiryId: string, reason: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(enquiryId).success || reason.length > 2000) return fail("errors.invalidInput");
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_enquiry", { p_enquiry_id: enquiryId, p_reason: reason.trim() });
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(undefined);
}

/** Totals are recomputed by the database; the client preview is only a convenience. */
export async function sendQuotation(input: QuoteInput): Promise<ActionResult> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_quotation", toQuotationArgs(parsed.data));
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(undefined);
}

export async function withdrawQuotation(quotationId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(quotationId).success) return fail("errors.invalidInput");
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_quotation", { p_quotation_id: quotationId });
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(undefined);
}

/** (A) Offline booking or manual block on a resource, entered in IST. */
export async function addCalendarEntry(input: CalendarEntryInput): Promise<ActionResult> {
  const parsed = calendarEntrySchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("reserve_resource", {
    p_resource_id: v.resourceId,
    p_starts_at: zonedToIso(v.date, v.startTime),
    p_ends_at: zonedToIso(v.date, v.endTime),
    p_source: v.kind === "offline" ? "offline" : "manual_block",
    p_status: v.kind === "offline" ? "confirmed" : "blocked",
    p_notes: v.notes || undefined,
  });
  if (error?.code === "23P01") return fail("calendar.conflict");
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(undefined);
}

export async function releaseCalendarEntry(reservationId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(reservationId).success) return fail("errors.invalidInput");
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { error } = await supabase.rpc("release_reservation", { p_reservation_id: reservationId });
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(undefined);
}

/** Roadmap V8: "Remind me" on a lead (null clears it). The database checks the date and access. */
export async function setFollowUp(enquiryId: string, on: string | null, note: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(enquiryId).success) return fail("errors.invalidInput");
  if (on !== null && !/^\d{4}-\d{2}-\d{2}$/.test(on)) return fail("validation.date");
  if (note.length > 300) return fail("validation.tooLong");
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_enquiry_follow_up", {
    p_enquiry_id: enquiryId,
    p_on: on as string, // null clears the reminder
    p_note: note.trim() || undefined,
  });
  if (error) return fail(error.code === "22023" ? "validation.dateFuture" : `errors.${mapDbError(error)}`);
  return ok(undefined);
}
