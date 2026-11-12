"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createOrder, getRazorpayConfig } from "@/features/payments/lib/razorpay";
import { verifyCheckoutSignature } from "@/features/payments/lib/signature";
import { cancelBookingSchema, checkoutResultSchema, type CancelBookingInput, type CheckoutResult } from "../schemas";

const idemKey = z.string().min(8).max(100);

/** Accepted quote / instant reservation → booking (pending the advance). Returns the booking item id. */
export async function createBooking(enquiryId: string, idempotencyKey: string): Promise<ActionResult<string>> {
  if (!z.uuid().safeParse(enquiryId).success || !idemKey.safeParse(idempotencyKey).success)
    return fail("errors.invalidInput");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_enquiry_id: enquiryId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return fail(error.code === "22023" ? "bookings.cannotBook" : `errors.${mapDbError(error)}`);
  return ok(data as string);
}

export type CheckoutOptions = {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
};

/**
 * Starts an online payment (advance while pending, else balance): records the
 * payment, creates a Razorpay order on the server and returns what the
 * browser checkout needs. The key secret never leaves the server.
 */
export async function startOnlinePayment(itemId: string): Promise<ActionResult<CheckoutOptions>> {
  if (!z.uuid().safeParse(itemId).success) return fail("errors.invalidInput");
  const config = getRazorpayConfig();
  if (!config) return fail("bookings.paymentsUnavailable");
  const user = await getCurrentUser();
  if (!user) return fail("errors.unauthenticated");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_payment", { p_booking_item_id: itemId });
  const payment = data?.[0];
  if (error || !payment) return fail(error?.code === "22023" ? "bookings.cannotPay" : `errors.${mapDbError(error)}`);

  let orderId = payment.razorpay_order_id;
  if (!orderId) {
    try {
      const order = await createOrder(config, {
        amountPaise: Number(payment.amount_paise),
        currency: payment.currency,
        receipt: payment.payment_id,
        notes: { booking_item_id: itemId, payment_id: payment.payment_id, kind: payment.kind },
      });
      orderId = order.id;
    } catch (e) {
      console.error("Razorpay order creation failed", e);
      return fail("bookings.gatewayError");
    }
    const { error: attachError } = await createAdminClient().rpc("attach_payment_order", {
      p_payment_id: payment.payment_id,
      p_order_id: orderId,
    });
    if (attachError) return fail(`errors.${mapDbError(attachError)}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone")
    .eq("id", user.id)
    .maybeSingle();
  return ok({
    keyId: config.keyId,
    orderId,
    amountPaise: Number(payment.amount_paise),
    currency: payment.currency,
    description: payment.kind === "advance" ? "Advance payment" : "Balance payment",
    prefill: {
      name: profile?.full_name ?? undefined,
      email: profile?.email ?? undefined,
      contact: profile?.phone ?? undefined,
    },
  });
}

/**
 * Razorpay checkout success callback. The signature proves the payment belongs
 * to our order; only then does the service role mark it paid (idempotent; the
 * webhook may arrive first or later).
 */
export async function confirmOnlinePayment(result: CheckoutResult): Promise<ActionResult> {
  const parsed = checkoutResultSchema.safeParse(result);
  if (!parsed.success) return fail("errors.invalidInput");
  const config = getRazorpayConfig();
  if (!config) return fail("bookings.paymentsUnavailable");
  const { orderId, paymentId, signature } = parsed.data;
  if (!verifyCheckoutSignature(orderId, paymentId, signature, config.keySecret))
    return fail("bookings.signatureInvalid");

  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("amount_paise")
    .eq("razorpay_order_id", orderId)
    .maybeSingle();
  if (!payment) return fail("errors.notFound");
  const { error } = await admin.rpc("confirm_online_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_amount_paise: payment.amount_paise,
  });
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(undefined);
}

/** Customer cancels their booking item; returns the refund queued (paise). */
export async function cancelBooking(input: CancelBookingInput): Promise<ActionResult<number>> {
  const parsed = cancelBookingSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_booking_item", {
    p_booking_item_id: parsed.data.itemId,
    p_reason: (parsed.data.reason || null) as unknown as string, // SQL accepts NULL
  });
  if (error) return fail(error.code === "22023" ? "bookings.cannotCancel" : `errors.${mapDbError(error)}`);
  return ok(Number(data));
}
