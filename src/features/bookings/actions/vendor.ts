"use server";

import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { rupeesToPaise } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import {
  manualRefundSchema,
  offlinePaymentSchema,
  vendorCancelSchema,
  type CancelBookingInput,
  type ManualRefundInput,
  type OfflinePaymentInput,
} from "../schemas";

/** Vendor records cash / UPI / bank transfer / cheque received for a booking (audited). */
export async function recordOfflinePayment(input: OfflinePaymentInput): Promise<ActionResult<string>> {
  const parsed = offlinePaymentSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_offline_payment", {
    p_booking_item_id: v.itemId,
    p_amount_paise: Number(rupeesToPaise(v.amount)),
    p_mode: v.mode,
    p_reference: (v.reference || null) as unknown as string, // SQL accepts NULL
    p_note: (v.note || null) as unknown as string,
    p_idempotency_key: v.idempotencyKey,
  });
  if (error) {
    if (error.code === "22023" && /amount/i.test(error.message))
      return fail("errors.invalidInput", { amount: "vendorBookings.amountTooHigh" });
    return fail(error.code === "22023" ? "vendorBookings.cannotRecord" : `errors.${mapDbError(error)}`);
  }
  return ok(data as string);
}

/** Vendor cancels one booking item (full refund of what was paid). Reason is required. */
export async function vendorCancelBooking(input: CancelBookingInput): Promise<ActionResult<number>> {
  const parsed = vendorCancelSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_booking_item", {
    p_booking_item_id: parsed.data.itemId,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(error.code === "22023" ? "bookings.cannotCancel" : `errors.${mapDbError(error)}`);
  return ok(Number(data));
}

/**
 * Marks a refund of money paid offline as returned (vendor who received it, or
 * finance). Needs a reference such as the UPI transaction id.
 */
export async function completeManualRefund(input: ManualRefundInput): Promise<ActionResult> {
  const parsed = manualRefundSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("begin_refund", { p_refund_id: parsed.data.refundId });
  if (error) return fail(`errors.${mapDbError(error)}`);
  if (data?.[0]?.method !== "offline") return fail("errors.forbidden");
  const { error: doneError } = await supabase.rpc("complete_refund", {
    p_refund_id: parsed.data.refundId,
    p_success: true,
    p_reference: parsed.data.reference,
  });
  if (doneError) return fail(`errors.${mapDbError(doneError)}`);
  return ok(undefined);
}
