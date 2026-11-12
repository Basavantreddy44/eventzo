"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPaymentMode, SIMULATED_PREFIX } from "../lib/razorpay";

const simId = (kind: "order" | "pay") => `${kind}_${SIMULATED_PREFIX}${randomBytes(9).toString("hex")}`;

/**
 * Dummy gateway (PAYMENTS_SIMULATOR=true, no Razorpay keys). Follows the same
 * path as a real payment: start_payment() as the customer (authorises them),
 * then the service role attaches a simulated order and confirms it, or marks
 * the attempt failed. Refused whenever real Razorpay keys are configured.
 */
export async function simulateOnlinePayment(itemId: string, succeed: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(itemId).success) return fail("errors.invalidInput");
  if (getPaymentMode() !== "simulator") return fail("bookings.paymentsUnavailable");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_payment", { p_booking_item_id: itemId });
  const payment = data?.[0];
  if (error || !payment) return fail(error?.code === "22023" ? "bookings.cannotPay" : `errors.${mapDbError(error)}`);

  const admin = createAdminClient();
  let orderId = payment.razorpay_order_id;
  if (!orderId) {
    orderId = simId("order");
    const { error: attachError } = await admin.rpc("attach_payment_order", {
      p_payment_id: payment.payment_id,
      p_order_id: orderId,
    });
    if (attachError) return fail(`errors.${mapDbError(attachError)}`);
  }

  if (!succeed) {
    await admin.rpc("mark_online_payment_failed", { p_order_id: orderId });
    return fail("bookings.payFailed");
  }
  const { error: confirmError } = await admin.rpc("confirm_online_payment", {
    p_order_id: orderId,
    p_payment_id: simId("pay"),
    p_amount_paise: payment.amount_paise,
  });
  if (confirmError) return fail(`errors.${mapDbError(confirmError)}`);
  return ok(undefined);
}
