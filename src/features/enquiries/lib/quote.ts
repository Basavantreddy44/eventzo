/**
 * Quote maths, mirroring public.send_quotation() exactly (the database result
 * is authoritative; this powers the live preview). All values in integer paise.
 */
export type QuoteLine = { quantity: number; unitPricePaise: number };

export function computeQuote(lines: QuoteLine[], discountPaise: number, taxBps: number) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPricePaise, 0);
  const discount = Math.min(Math.max(discountPaise, 0), subtotal);
  const taxable = subtotal - discount;
  // Postgres round() on a positive numeric rounds half away from zero = Math.round here.
  const tax = Math.round((taxable * taxBps) / 10000);
  return { subtotal, discount, taxable, tax, total: taxable + tax };
}

/** 18 or "18.5" (%) → basis points (1850). Returns null when invalid. */
export function percentToBps(value: string): number | null {
  const v = value.trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(v)) return null;
  const bps = Math.round(Number(v) * 100);
  return bps <= 5000 ? bps : null;
}

/** Applies a surcharge in basis points to a paise amount (rounded to the rupee). */
export function applySurcharge(paise: number, bps: number): number {
  if (!bps) return paise;
  return Math.round((paise * (10000 + bps)) / 10000 / 100) * 100;
}

/** Time left on a hold, for "12h 30m left" labels. */
export function holdRemaining(expiresAt: string | Date, now: Date = new Date()) {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return { expired: true, hours: 0, minutes: 0 } as const;
  const minutes = Math.floor(ms / 60000);
  return { expired: false, hours: Math.floor(minutes / 60), minutes: minutes % 60 } as const;
}
