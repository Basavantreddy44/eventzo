import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceFor, advancePercentToBps, amountsDue, refundBps, refundFor } from "@/features/bookings/lib/money";
import {
  cancelBookingSchema,
  checkoutResultSchema,
  manualRefundSchema,
  offlinePaymentSchema,
  vendorCancelSchema,
} from "@/features/bookings/schemas";
import {
  signCheckout,
  signWebhook,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "@/features/payments/lib/signature";
import { parseWebhook } from "@/features/payments/lib/webhook";
import { listingSchema, toServiceRow } from "@/features/vendor/schemas";
import { emptyListing, listingToInput } from "@/features/vendor/lib/listing-defaults";

const UUID = "0b6c1c38-4a3e-4c55-9d43-5d0d7b7d3a11";

describe("booking money (mirrors create_booking / refund_bps)", () => {
  it("advance is the ceiling of total × percent, in paise", () => {
    expect(advanceFor(10_000_000, 2500)).toBe(2_500_000);
    expect(advanceFor(333, 2500)).toBe(84); // 83.25 → 84 paise (never under-collect)
    expect(advanceFor(2_000_000, 10000)).toBe(2_000_000);
  });

  it.each([
    ["flexible", 7, 10000],
    ["flexible", 6, 5000],
    ["flexible", 1, 5000],
    ["flexible", 0, 0],
    ["moderate", 30, 10000],
    ["moderate", 29, 5000],
    ["moderate", 7, 5000],
    ["moderate", 6, 0],
    ["strict", 30, 5000],
    ["strict", 29, 0],
  ] as const)("%s policy, %i days before → %i bps", (policy, days, bps) => {
    expect(refundBps(policy, days, false)).toBe(bps);
  });

  it("vendor cancellations always refund in full", () => {
    expect(refundBps("strict", 0, true)).toBe(10000);
  });

  it("refunds round down to the paisa", () => {
    expect(refundFor(10_000_001, 5000)).toBe(5_000_000);
  });

  it("advance percent accepts whole numbers from 10 to 100", () => {
    expect(advancePercentToBps("25")).toBe(2500);
    expect(advancePercentToBps("100")).toBe(10000);
    expect(advancePercentToBps("9")).toBeNull();
    expect(advancePercentToBps("101")).toBeNull();
    expect(advancePercentToBps("12.5")).toBeNull();
    expect(advancePercentToBps("")).toBeNull();
  });

  it("amounts due follow the booking status", () => {
    const base = { total_paise: 10_000_000, advance_paise: 2_500_000 };
    expect(amountsDue({ ...base, status: "pending_payment", paid_paise: 0 })).toEqual({
      balance: 10_000_000,
      advanceDue: 2_500_000,
      payable: 2_500_000,
    });
    expect(amountsDue({ ...base, status: "confirmed", paid_paise: 2_500_000 }).payable).toBe(7_500_000);
    expect(amountsDue({ ...base, status: "cancelled", paid_paise: 2_500_000 }).payable).toBe(0);
  });
});

describe("Razorpay signatures", () => {
  const secret = "test_secret_value";

  it("accepts a correct checkout signature and rejects tampering", () => {
    const sig = signCheckout("order_ABC", "pay_XYZ", secret);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", sig, secret)).toBe(true);
    expect(verifyCheckoutSignature("order_ABC", "pay_OTHER", sig, secret)).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", sig, "wrong")).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", "zz", secret)).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", "", secret)).toBe(false);
  });

  it("verifies webhook bodies byte-for-byte", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const sig = signWebhook(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(body.replace("captured", "failed"), sig, secret)).toBe(false);
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, sig.toUpperCase(), secret)).toBe(true);
  });
});

describe("Razorpay webhook parsing", () => {
  it("payment.captured → confirm the order", () => {
    expect(
      parseWebhook({
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 2500000 } } },
      }),
    ).toEqual({ type: "payment_captured", orderId: "order_1", paymentId: "pay_1", amountPaise: 2500000 });
  });

  it("order.paid takes the order id from the order entity when needed", () => {
    expect(
      parseWebhook({
        event: "order.paid",
        payload: { payment: { entity: { id: "pay_2", amount: 100 } }, order: { entity: { id: "order_2" } } },
      }),
    ).toMatchObject({ type: "payment_captured", orderId: "order_2" });
  });

  it("payment.failed and refunds", () => {
    expect(
      parseWebhook({ event: "payment.failed", payload: { payment: { entity: { order_id: "order_3" } } } }),
    ).toEqual({ type: "payment_failed", orderId: "order_3" });
    expect(
      parseWebhook({
        event: "refund.processed",
        payload: { refund: { entity: { id: "rfnd_1", notes: { refund_id: UUID } } } },
      }),
    ).toEqual({ type: "refund_settled", razorpayRefundId: "rfnd_1", success: true, ourRefundId: UUID });
    expect(parseWebhook({ event: "refund.failed", payload: { refund: { entity: { id: "rfnd_2" } } } })).toMatchObject({
      success: false,
      ourRefundId: null,
    });
  });

  it("ignores malformed or unrelated events", () => {
    expect(parseWebhook(null).type).toBe("ignore");
    expect(parseWebhook({ event: "payment.captured", payload: {} }).type).toBe("ignore");
    expect(
      parseWebhook({
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 10.5 } } },
      }).type,
    ).toBe("ignore");
    expect(parseWebhook({ event: "subscription.charged" }).type).toBe("ignore");
  });
});

describe("booking form schemas", () => {
  const offline = {
    itemId: UUID,
    amount: "25,000",
    mode: "upi" as const,
    reference: "",
    note: "",
    idempotencyKey: "abcdefgh-1234",
  };

  it("offline payments need a positive rupee amount and a mode", () => {
    expect(offlinePaymentSchema.safeParse(offline).success).toBe(true);
    expect(offlinePaymentSchema.safeParse({ ...offline, amount: "0" }).success).toBe(false);
    expect(offlinePaymentSchema.safeParse({ ...offline, amount: "abc" }).success).toBe(false);
    expect(offlinePaymentSchema.safeParse({ ...offline, mode: "crypto" }).success).toBe(false);
  });

  it("vendors must give a reason to cancel; customers need not", () => {
    expect(cancelBookingSchema.safeParse({ itemId: UUID, reason: "" }).success).toBe(true);
    expect(vendorCancelSchema.safeParse({ itemId: UUID, reason: "   " }).success).toBe(false);
    expect(vendorCancelSchema.safeParse({ itemId: UUID, reason: "Hall under repair" }).success).toBe(true);
  });

  it("manual refunds need a reference", () => {
    expect(manualRefundSchema.safeParse({ refundId: UUID, reference: "" }).success).toBe(false);
    expect(manualRefundSchema.safeParse({ refundId: UUID, reference: "UPI-1" }).success).toBe(true);
  });

  it("checkout results must look like Razorpay ids", () => {
    const ok = { orderId: "order_Abc123", paymentId: "pay_Xyz789", signature: "a".repeat(64) };
    expect(checkoutResultSchema.safeParse(ok).success).toBe(true);
    expect(checkoutResultSchema.safeParse({ ...ok, orderId: "order_1;drop" }).success).toBe(false);
    expect(checkoutResultSchema.safeParse({ ...ok, signature: "short" }).success).toBe(false);
  });
});

describe("listing booking terms (Phase 5)", () => {
  const base = {
    ...emptyListing({ cityId: UUID, branchId: "" }),
    serviceCategoryId: UUID,
    title: "Test Hall",
    priceType: "on_request" as const,
  };

  it("defaults to 25% advance and the moderate policy", () => {
    expect(toServiceRow(listingSchema.parse(base))).toMatchObject({
      advance_bps: 2500,
      cancellation_policy: "moderate",
    });
  });

  it("stores the advance in basis points and rejects out-of-range values", () => {
    expect(
      toServiceRow(listingSchema.parse({ ...base, advancePercent: "50", cancellationPolicy: "strict" })),
    ).toMatchObject({ advance_bps: 5000, cancellation_policy: "strict" });
    expect(listingSchema.safeParse({ ...base, advancePercent: "5" }).success).toBe(false);
  });

  it("round-trips from the database row", () => {
    const input = listingToInput({
      id: UUID,
      service_category_id: UUID,
      title: "Test Hall",
      summary: null,
      description: null,
      booking_mode: "request",
      branch_id: null,
      city_id: UUID,
      area_id: null,
      price_type: "on_request",
      price_unit: null,
      base_price_paise: null,
      max_price_paise: null,
      min_guests: null,
      max_guests: null,
      advance_bps: 3000,
      cancellation_policy: "flexible",
      venue_details: null,
      catering_details: null,
    });
    expect(input).toMatchObject({ advancePercent: "30", cancellationPolicy: "flexible" });
  });
});

describe("payment gateway mode", () => {
  const KEYS = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "PAYMENTS_SIMULATOR"] as const;
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  const load = async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    return import("@/features/payments/lib/razorpay");
  };
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("is off without keys or simulator flag", async () => {
    for (const k of KEYS) delete process.env[k];
    expect((await load()).getPaymentMode()).toBeNull();
  });

  it("uses the simulator only when explicitly enabled", async () => {
    for (const k of KEYS) delete process.env[k];
    process.env.PAYMENTS_SIMULATOR = "true";
    expect((await load()).getPaymentMode()).toBe("simulator");
    process.env.PAYMENTS_SIMULATOR = "yes";
    expect((await load()).getPaymentMode()).toBeNull();
  });

  it("real Razorpay keys always win over the simulator", async () => {
    process.env.PAYMENTS_SIMULATOR = "true";
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc";
    process.env.RAZORPAY_KEY_SECRET = "secret";
    expect((await load()).getPaymentMode()).toBe("razorpay");
  });
});
