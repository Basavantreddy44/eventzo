/**
 * Booking money rules, mirroring the database (which is authoritative):
 *   advance  = ceil(total × advance_bps / 10000)        (public.create_booking)
 *   refund % = private.refund_bps(policy, days, vendor)  (public.cancellation_quote)
 * All amounts are integer paise (D6).
 */
export type CancellationPolicy = "flexible" | "moderate" | "strict";

export const CANCELLATION_POLICIES: CancellationPolicy[] = ["flexible", "moderate", "strict"];

export function advanceFor(totalPaise: number, advanceBps: number) {
  return Math.ceil((totalPaise * advanceBps) / 10000);
}

export function refundBps(policy: CancellationPolicy, daysBefore: number, byVendor: boolean) {
  if (byVendor) return 10000;
  switch (policy) {
    case "flexible":
      return daysBefore >= 7 ? 10000 : daysBefore >= 1 ? 5000 : 0;
    case "moderate":
      return daysBefore >= 30 ? 10000 : daysBefore >= 7 ? 5000 : 0;
    case "strict":
      return daysBefore >= 30 ? 5000 : 0;
  }
}

export function refundFor(paidPaise: number, bps: number) {
  return Math.floor((paidPaise * bps) / 10000);
}

/** "25" → 2500 bps; whole percentages from 10 to 100. Null when invalid. */
export function advancePercentToBps(value: string): number | null {
  const v = value.trim();
  if (!/^\d{1,3}$/.test(v)) return null;
  const n = Number(v);
  return n >= 10 && n <= 100 ? n * 100 : null;
}

/** What is still owed and what can be paid online right now. */
export function amountsDue(item: { status: string; total_paise: number; advance_paise: number; paid_paise: number }) {
  const balance = Math.max(item.total_paise - item.paid_paise, 0);
  const advanceDue = item.status === "pending_payment" ? Math.max(item.advance_paise - item.paid_paise, 0) : 0;
  const payable = item.status === "pending_payment" ? advanceDue : item.status === "confirmed" ? balance : 0;
  return { balance, advanceDue, payable };
}
