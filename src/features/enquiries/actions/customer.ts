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
export async function checkAvailability(serviceId: string, date: string): Promise<ActionResult<AvailabilityCheck>> {
  if (!z.uuid().safeParse(serviceId).success || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("errors.invalidInput");
  const { data, error } = await createPublicClient().rpc("listing_availability", {
    p_service_id: serviceId,
    p_from: date,
    p_to: date,
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

export async function createEnquiry(input: EnquiryInput): Promise<ActionResult<string>> {
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const user = await getCurrentUser();
  if (!user) return fail("errors.unauthenticated");

  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_enquiry", {
    p_service_id: v.serviceId,
    p_event_date: v.date,
    p_start_time: v.startTime,
    p_end_time: v.endTime,
    // The SQL function accepts NULL for "not given"; generated types don't model that.
    p_guests: (v.guests ? Number(v.guests) : null) as unknown as number,
    p_message: (v.message || null) as unknown as string,
    p_idempotency_key: v.idempotencyKey,
  });
  if (error) {
    if (error.code === "22023" && /guests/.test(error.message))
      return fail("errors.invalidInput", { guests: "validation.invalid" });
    return fail(ERRORS[error.code ?? ""] ?? `errors.${mapDbError(error)}`);
  }
  return ok(data as string);
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
