"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { createRefund, getPaymentMode, getRazorpayConfig, SIMULATED_PREFIX } from "@/features/payments/lib/razorpay";

/**
 * Finance issues an online refund through Razorpay. begin_refund() checks the
 * finance.manage permission and locks the refund; the outcome is recorded with
 * complete_refund(). Nothing is paid out automatically (D8).
 */
export async function issueOnlineRefund(refundId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(refundId).success) return fail("errors.invalidInput");
  const mode = getPaymentMode();
  if (!mode) return fail("bookings.paymentsUnavailable");
  const config = getRazorpayConfig();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("begin_refund", { p_refund_id: refundId });
  const refund = data?.[0];
  if (error || !refund) return fail(`errors.${mapDbError(error)}`);
  if (refund.method !== "razorpay" || !refund.razorpay_payment_id) {
    await supabase.rpc("complete_refund", { p_refund_id: refundId, p_success: false, p_reference: "" });
    return fail("refunds.notOnline");
  }

  let gatewayId: string;
  try {
    if (refund.razorpay_payment_id.startsWith(`pay_${SIMULATED_PREFIX}`)) {
      // Simulated payment: the refund is simulated too (no gateway call, no money).
      gatewayId = `rfnd_${SIMULATED_PREFIX}${randomBytes(9).toString("hex")}`;
    } else {
      if (!config) throw new Error("Razorpay keys are required to refund a real payment");
      const result = await createRefund(config, refund.razorpay_payment_id, Number(refund.amount_paise), {
        refund_id: refundId,
      });
      gatewayId = result.id;
    }
  } catch (e) {
    console.error("Razorpay refund failed", e);
    await supabase.rpc("complete_refund", { p_refund_id: refundId, p_success: false, p_reference: "" });
    return fail("bookings.gatewayError");
  }
  const { error: doneError } = await supabase.rpc("complete_refund", {
    p_refund_id: refundId,
    p_success: true,
    p_reference: gatewayId,
  });
  if (doneError) return fail(`errors.${mapDbError(doneError)}`);
  return ok(undefined);
}
