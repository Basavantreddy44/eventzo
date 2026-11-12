import "server-only";

/**
 * Razorpay (test mode first, D8). Server-only: the key secret and webhook
 * secret never reach the browser. When keys are missing, online payment is
 * shown as unavailable (with the reason) instead of failing.
 */
export type RazorpayConfig = { keyId: string; keySecret: string; webhookSecret: string | null };

export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null };
}

export function isOnlinePaymentEnabled() {
  return getPaymentMode() !== null;
}

/**
 * Which online gateway is active:
 * - "razorpay"  when keys are configured (always wins);
 * - "simulator" when PAYMENTS_SIMULATOR=true and there are no keys: a clearly
 *   labelled dummy gateway for demos and testing (no real money). It runs the
 *   same database path as Razorpay. NEVER enable it for real customers.
 * - null: online payment unavailable (buttons show why).
 */
export type PaymentMode = "razorpay" | "simulator";
export function getPaymentMode(): PaymentMode | null {
  if (getRazorpayConfig()) return "razorpay";
  return process.env.PAYMENTS_SIMULATOR?.trim().toLowerCase() === "true" ? "simulator" : null;
}

/** Ids given to simulated payments/refunds, so they are recognisable everywhere. */
export const SIMULATED_PREFIX = "sim_";

/** Test keys start with rzp_test_; anything else is live money. */
export function isTestMode(config: RazorpayConfig) {
  return config.keyId.startsWith("rzp_test_");
}

const API = "https://api.razorpay.com/v1";

async function call<T>(config: RazorpayConfig, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok)
    throw new Error(`Razorpay ${path} failed (${res.status}): ${json.error?.description ?? "unknown error"}`);
  return json;
}

export function createOrder(
  config: RazorpayConfig,
  input: { amountPaise: number; currency: string; receipt: string; notes: Record<string, string> },
) {
  return call<{ id: string; amount: number; currency: string; status: string }>(config, "/orders", {
    amount: input.amountPaise,
    currency: input.currency,
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
  });
}

export function createRefund(
  config: RazorpayConfig,
  paymentId: string,
  amountPaise: number,
  notes: Record<string, string>,
) {
  return call<{ id: string; status: string }>(config, `/payments/${encodeURIComponent(paymentId)}/refund`, {
    amount: amountPaise,
    notes,
  });
}
