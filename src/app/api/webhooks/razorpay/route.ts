import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRazorpayConfig } from "@/features/payments/lib/razorpay";
import { verifyWebhookSignature } from "@/features/payments/lib/signature";
import { parseWebhook } from "@/features/payments/lib/webhook";

/**
 * Razorpay webhook (D2: route handlers only where required).
 * 1. Verify X-Razorpay-Signature over the raw body with the webhook secret.
 * 2. De-duplicate by X-Razorpay-Event-Id (Razorpay retries deliveries).
 * 3. Apply through service-role-only database functions, all idempotent.
 * Unknown orders are acknowledged (200) so Razorpay stops retrying; real
 * failures return 500 so it retries.
 */
export async function POST(request: NextRequest) {
  const config = getRazorpayConfig();
  if (!config?.webhookSecret) return NextResponse.json({ error: "webhooks not configured" }, { status: 503 });

  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"), config.webhookSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const admin = createAdminClient();
  const eventId =
    request.headers.get("x-razorpay-event-id") ??
    `nohdr:${(body as { created_at?: number }).created_at ?? Date.now()}:${raw.length}`;
  const eventType = String((body as { event?: unknown }).event ?? "unknown");

  const { data: existing } = await admin
    .from("payment_webhook_events")
    .select("processed_at")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing?.processed_at) return NextResponse.json({ ok: true, duplicate: true });
  if (!existing) {
    const { error } = await admin
      .from("payment_webhook_events")
      .insert({ event_id: eventId, event_type: eventType, payload: body as never });
    if (error && error.code !== "23505") return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  const action = parseWebhook(body);
  let error: { code?: string; message: string } | null = null;
  switch (action.type) {
    case "payment_captured":
      ({ error } = await admin.rpc("confirm_online_payment", {
        p_order_id: action.orderId,
        p_payment_id: action.paymentId,
        p_amount_paise: action.amountPaise,
      }));
      break;
    case "payment_failed":
      ({ error } = await admin.rpc("mark_online_payment_failed", { p_order_id: action.orderId }));
      break;
    case "refund_settled":
      if (action.ourRefundId && action.success) {
        ({ error } = await admin.rpc("complete_refund", {
          p_refund_id: action.ourRefundId,
          p_success: true,
          p_reference: action.razorpayRefundId,
        }));
        // Already recorded by the finance action, or not started from here: fall back to the gateway id.
        if (error)
          ({ error } = await admin.rpc("settle_online_refund", {
            p_razorpay_refund_id: action.razorpayRefundId,
            p_success: true,
          }));
      } else {
        ({ error } = await admin.rpc("settle_online_refund", {
          p_razorpay_refund_id: action.razorpayRefundId,
          p_success: action.success,
        }));
      }
      break;
    case "ignore":
      break;
  }

  const notOurs = error?.code === "P0002";
  await admin
    .from("payment_webhook_events")
    .update({
      processed_at: error && !notOurs ? null : new Date().toISOString(),
      error: error ? error.message.slice(0, 500) : action.type === "ignore" ? action.reason : null,
    })
    .eq("event_id", eventId);

  if (error && !notOurs) {
    console.error("Razorpay webhook processing failed", eventType, error.message);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
