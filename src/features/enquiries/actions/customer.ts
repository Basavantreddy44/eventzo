"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { toFieldErrors } from "@/features/auth/schemas";
import { enquirySchema, type EnquiryInput } from "../schemas";

export type AvailabilityCheck = {
  status: "available" | "unavailable" | "unknown";
  auspicious: boolean;
  surchargeBps: number;
};

/** Public, read-only: availability + auspicious-date surcharge for one listing/date. */
export async function checkAvailability(
  serviceId: string,
  date: string,
  startTime = "10:00",
  endTime = "22:00",
): Promise<ActionResult<AvailabilityCheck>> {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (
    !z.uuid().safeParse(serviceId).success ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !time.test(startTime) ||
    !time.test(endTime) ||
    endTime <= startTime
  )
    return fail("errors.invalidInput");
  // Check the hours the customer asked for, not the whole day (QA B12).
  const { data, error } = await createPublicClient().rpc("listing_availability", {
    p_service_id: serviceId,
    p_from: date,
    p_to: date,
    p_start: startTime,
    p_end: endTime,
  });
  if (error) return fail(`errors.${mapDbError(error)}`);
  const day = data?.[0];
  return ok({
    status: (day?.status ?? "unknown") as AvailabilityCheck["status"],
    auspicious: !!day?.auspicious,
    surchargeBps: day?.surcharge_bps ?? 0,
  });
}

const ERRORS: Record<string, string> = {
  "23P01": "enquiry.unavailableError",
  "42501": "enquiry.ownBusiness",
};

export async function createEnquiry(input: EnquiryInput): Promise<ActionResult<{ id: string; extra: number }>> {
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const user = await getCurrentUser();
  if (!user) return fail("errors.unauthenticated");

  const v = parsed.data;
  const supabase = await createClient();
  const send = (serviceId: string, key: string) =>
    supabase.rpc("create_enquiry", {
      p_service_id: serviceId,
      p_event_date: v.date,
      p_start_time: v.startTime,
      p_end_time: v.endTime,
      // The SQL function accepts NULL for "not given"; generated types don't model that.
      p_guests: (v.guests ? Number(v.guests) : null) as unknown as number,
      p_message: (v.message || null) as unknown as string,
      p_idempotency_key: key,
    });
  const fileUnderEvent = async (enquiryId: string) => {
    if (v.eventId) await supabase.rpc("set_enquiry_event", { p_enquiry_id: enquiryId, p_event_id: v.eventId });
  };

  const { data, error } = await send(v.serviceId, v.idempotencyKey);
  if (error) {
    if (error.code === "22023" && /guests/.test(error.message))
      return fail("errors.invalidInput", { guests: "validation.invalid" });
    return fail(ERRORS[error.code ?? ""] ?? `errors.${mapDbError(error)}`);
  }
  const id = data as string;
  await fileUnderEvent(id);

  // Roadmap C3: the same request to up to 2 similar vendors that are free. Best effort:
  // a vendor that just got booked is skipped, never failing the main enquiry.
  let extra = 0;
  if (v.alsoAsk) {
    const { data: similar } = await supabase.rpc("similar_available_services", {
      p_service_id: v.serviceId,
      p_event_date: v.date,
      p_start: v.startTime,
      p_end: v.endTime,
      p_guests: (v.guests ? Number(v.guests) : null) as unknown as number,
      p_limit: 2,
    });
    for (const [i, s] of (similar ?? []).entries()) {
      const res = await send(s.id, `${v.idempotencyKey.slice(0, 90)}-x${i + 1}`);
      if (!res.error && res.data) {
        await fileUnderEvent(res.data as string);
        extra += 1;
      }
    }
  }
  return ok({ id, extra });
}

/** The signed-in customer's upcoming events, for the enquiry form's "For event" choice. */
export async function myUpcomingEvents(): Promise<{ id: string; title: string; start_date: string }[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("events")
    .select("id, title, start_date")
    .eq("owner_id", user.id)
    .gte("start_date", today)
    .order("start_date")
    .limit(20);
  return data ?? [];
}

export async function cancelEnquiry(enquiryId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(enquiryId).success) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_enquiry", { p_enquiry_id: enquiryId });
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(undefined);
}

export async function respondQuotation(quotationId: string, accept: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(quotationId).success) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_quotation", { p_quotation_id: quotationId, p_accept: accept });
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(undefined);
}

/** Used by both sides; the RPC decides whether the caller is the customer or the vendor. */
export async function postEnquiryMessage(enquiryId: string, body: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(enquiryId).success) return fail("errors.invalidInput");
  if (!body.trim() || body.length > 2000) return fail("validation.message");
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_enquiry_message", { p_enquiry_id: enquiryId, p_body: body });
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(undefined);
}

export type CalendarDay = {
  day: string;
  status: "free" | "held" | "booked" | "unknown";
  auspicious: boolean;
  surchargeBps: number;
};

/** Public, read-only: one month of a listing's calendar (Roadmap C2). `month` is YYYY-MM. */
export async function listingMonth(serviceId: string, month: string): Promise<ActionResult<CalendarDay[]>> {
  if (!z.uuid().safeParse(serviceId).success || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return fail("errors.invalidInput");
  const { data, error } = await createPublicClient().rpc("listing_month", {
    p_service_id: serviceId,
    p_month: `${month}-01`,
  });
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(
    (data ?? []).map((d) => ({
      day: d.day,
      status: d.status as CalendarDay["status"],
      auspicious: d.auspicious,
      surchargeBps: d.surcharge_bps,
    })),
  );
}
