import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay signature checks (pure, unit-tested).
 * - Checkout: HMAC-SHA256(order_id + "|" + payment_id, key_secret)
 * - Webhook:  HMAC-SHA256(raw request body, webhook_secret)
 * Both are hex digests compared in constant time.
 */
function hmacHex(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function safeEqualHex(expected: string, given: string) {
  if (!/^[0-9a-f]+$/i.test(given) || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given.toLowerCase(), "hex"));
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, keySecret: string) {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  return safeEqualHex(hmacHex(`${orderId}|${paymentId}`, keySecret), signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string) {
  if (!signature || !webhookSecret) return false;
  return safeEqualHex(hmacHex(rawBody, webhookSecret), signature);
}

/** For tests and local tooling: sign like Razorpay does. */
export function signWebhook(rawBody: string, webhookSecret: string) {
  return hmacHex(rawBody, webhookSecret);
}
export function signCheckout(orderId: string, paymentId: string, keySecret: string) {
  return hmacHex(`${orderId}|${paymentId}`, keySecret);
}
