import { z } from "zod";
import { rupeesToPaise } from "@/lib/money";
import { percentToBps } from "../lib/quote";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "validation.date");

// ---------- customer enquiry -------------------------------------------------------
export const enquirySchema = z
  .object({
    serviceId: z.uuid(),
    date: isoDate,
    startTime: z.string().regex(TIME, "validation.time"),
    endTime: z.string().regex(TIME, "validation.time"),
    guests: z
      .string()
      .trim()
      .refine((v) => v === "" || (/^\d{1,6}$/.test(v) && Number(v) >= 1), "validation.invalid"),
    message: z.string().trim().max(2000, "validation.message"),
    idempotencyKey: z.string().min(8).max(100),
  })
  .refine((v) => v.endTime > v.startTime, { path: ["endTime"], message: "validation.timeOrder" });
export type EnquiryInput = z.infer<typeof enquirySchema>;

// ---------- vendor quotation ----------------------------------------------------------
const rupees = z
  .string()
  .trim()
  .min(1, "validation.required")
  .refine((v) => rupeesToPaise(v) !== null, "validation.amount");

export const quoteSchema = z.object({
  enquiryId: z.uuid(),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1, "validation.required").max(200, "validation.invalid"),
        quantity: z
          .string()
          .trim()
          .refine((v) => /^\d{1,6}$/.test(v) && Number(v) >= 1, "validation.invalid"),
        unitPrice: rupees,
      }),
    )
    .min(1, "validation.lineItems")
    .max(50, "validation.lineItems"),
  discount: z
    .string()
    .trim()
    .refine((v) => v === "" || rupeesToPaise(v) !== null, "validation.amount"),
  taxPercent: z
    .string()
    .trim()
    .refine((v) => v === "" || percentToBps(v) !== null, "validation.percent"),
  validHours: z
    .string()
    .trim()
    .refine((v) => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 720, "validation.hours"),
  notes: z.string().trim().max(2000, "validation.message"),
  terms: z.string().trim().max(4000, "validation.message"),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

/** Form values → send_quotation() arguments (all money in paise). */
export function toQuotationArgs(v: QuoteInput) {
  return {
    p_enquiry_id: v.enquiryId,
    p_items: v.items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unit_price_paise: Number(rupeesToPaise(i.unitPrice)),
    })),
    p_discount_paise: v.discount ? Number(rupeesToPaise(v.discount)) : 0,
    p_tax_bps: v.taxPercent ? (percentToBps(v.taxPercent) ?? 0) : 0,
    p_valid_hours: Number(v.validHours),
    // NULL = "not given" in SQL; generated types don't model nullable args.
    p_notes: (v.notes || null) as unknown as string,
    p_terms: (v.terms || null) as unknown as string,
  };
}

// ---------- vendor calendar entry (A) ---------------------------------------------------
export const calendarEntrySchema = z
  .object({
    resourceId: z.uuid("validation.select"),
    kind: z.enum(["offline", "block"]),
    date: isoDate,
    startTime: z.string().regex(TIME, "validation.time"),
    endTime: z.string().regex(TIME, "validation.time"),
    notes: z.string().trim().max(1000, "validation.message"),
  })
  .refine((v) => v.endTime > v.startTime, { path: ["endTime"], message: "validation.timeOrder" });
export type CalendarEntryInput = z.infer<typeof calendarEntrySchema>;

/** Local wall-clock date + time in a zone → ISO instant (IST has no DST, but stay generic). */
export function zonedToIso(date: string, time: string, timeZone = "Asia/Kolkata"): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (asLocal - guess.getTime())).toISOString();
}
