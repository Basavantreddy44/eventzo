import { z } from "zod";
import { rupeesToPaise } from "@/lib/money";

export const OFFLINE_MODES = ["cash", "upi", "bank_transfer", "cheque"] as const;
export type OfflineMode = (typeof OFFLINE_MODES)[number];

// ---------- vendor: money received outside the platform ---------------------------
export const offlinePaymentSchema = z.object({
  itemId: z.uuid(),
  amount: z
    .string()
    .trim()
    .min(1, "validation.required")
    .refine((v) => {
      const p = rupeesToPaise(v);
      return p !== null && p > 0n;
    }, "validation.amount"),
  mode: z.enum(OFFLINE_MODES, "validation.select"),
  reference: z.string().trim().max(200, "validation.invalid"),
  note: z.string().trim().max(500, "validation.invalid"),
  idempotencyKey: z.string().min(8).max(100),
});
export type OfflinePaymentInput = z.infer<typeof offlinePaymentSchema>;

// ---------- cancellation (customer reason optional, vendor reason required) --------
export const cancelBookingSchema = z.object({
  itemId: z.uuid(),
  reason: z.string().trim().max(1000, "validation.invalid"),
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const vendorCancelSchema = cancelBookingSchema.extend({
  reason: z.string().trim().min(1, "validation.required").max(1000, "validation.invalid"),
});

// ---------- refunds -----------------------------------------------------------------
export const manualRefundSchema = z.object({
  refundId: z.uuid(),
  reference: z.string().trim().min(1, "validation.required").max(200, "validation.invalid"),
});
export type ManualRefundInput = z.infer<typeof manualRefundSchema>;

// ---------- Razorpay checkout callback -------------------------------------------------
export const checkoutResultSchema = z.object({
  orderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  signature: z.string().regex(/^[0-9a-f]{64}$/i),
});
export type CheckoutResult = z.infer<typeof checkoutResultSchema>;
