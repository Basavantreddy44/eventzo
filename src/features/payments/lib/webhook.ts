/**
 * Turns a Razorpay webhook body into the one thing we need to do. Pure (unit-tested).
 * Docs: payment.captured / order.paid / payment.failed / refund.processed / refund.failed.
 */
export type WebhookAction =
  | { type: "payment_captured"; orderId: string; paymentId: string; amountPaise: number }
  | { type: "payment_failed"; orderId: string }
  | { type: "refund_settled"; razorpayRefundId: string; success: boolean; ourRefundId: string | null }
  | { type: "ignore"; reason: string };

type Entity = Record<string, unknown>;
const entity = (payload: unknown, key: string): Entity | null => {
  const node = (payload as Record<string, { entity?: Entity }> | undefined)?.[key];
  return node?.entity && typeof node.entity === "object" ? node.entity : null;
};
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

export function parseWebhook(body: unknown): WebhookAction {
  if (!body || typeof body !== "object") return { type: "ignore", reason: "not an object" };
  const event = str((body as { event?: unknown }).event);
  const payload = (body as { payload?: unknown }).payload;
  if (!event) return { type: "ignore", reason: "no event" };

  switch (event) {
    case "payment.captured":
    case "order.paid": {
      const payment = entity(payload, "payment");
      const orderId = str(payment?.order_id) ?? str(entity(payload, "order")?.id);
      const paymentId = str(payment?.id);
      const amount = payment?.amount;
      if (!orderId || !paymentId || typeof amount !== "number" || !Number.isInteger(amount))
        return { type: "ignore", reason: `${event} without order/payment/amount` };
      return { type: "payment_captured", orderId, paymentId, amountPaise: amount };
    }
    case "payment.failed": {
      const orderId = str(entity(payload, "payment")?.order_id);
      return orderId ? { type: "payment_failed", orderId } : { type: "ignore", reason: "failed payment without order" };
    }
    case "refund.processed":
    case "refund.failed": {
      const refund = entity(payload, "refund");
      const id = str(refund?.id);
      if (!id) return { type: "ignore", reason: "refund without id" };
      const notes = refund?.notes as Record<string, unknown> | undefined;
      return {
        type: "refund_settled",
        razorpayRefundId: id,
        success: event === "refund.processed",
        ourRefundId: str(notes?.refund_id),
      };
    }
    default:
      return { type: "ignore", reason: `unhandled event ${event}` };
  }
}
