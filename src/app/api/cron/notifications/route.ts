import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { dispatchOutbox, getDeliveryMode } from "@/features/notifications/lib/delivery";

/**
 * Scheduled delivery of the WhatsApp/email outbox (e.g. Vercel Cron, which
 * sends `Authorization: Bearer $CRON_SECRET`). 503 until a secret and a
 * delivery mode are configured.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!getDeliveryMode()) return NextResponse.json({ error: "no delivery provider configured" }, { status: 503 });
  try {
    return NextResponse.json(await dispatchOutbox(100));
  } catch (e) {
    console.error("Outbox dispatch failed", e);
    return NextResponse.json({ error: "dispatch failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
