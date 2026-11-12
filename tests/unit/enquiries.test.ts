import { describe, expect, it } from "vitest";
import { toFieldErrors } from "@/features/auth/schemas";
import { applySurcharge, computeQuote, holdRemaining, percentToBps } from "@/features/enquiries/lib/quote";
import {
  calendarEntrySchema,
  enquirySchema,
  quoteSchema,
  toQuotationArgs,
  zonedToIso,
} from "@/features/enquiries/schemas";

const UUID = "0b6c1c38-4a3e-4c55-9d43-5d0d7b7d3a11";

describe("quote maths (mirrors send_quotation)", () => {
  it("matches the database example: (1,00,000 + 100 × 50 − 5,000) + 18% = 1,18,000", () => {
    expect(
      computeQuote(
        [
          { quantity: 1, unitPricePaise: 10_000_000 },
          { quantity: 100, unitPricePaise: 5_000 },
        ],
        500_000,
        1800,
      ),
    ).toEqual({
      subtotal: 10_500_000,
      discount: 500_000,
      taxable: 10_000_000,
      tax: 1_800_000,
      total: 11_800_000,
    });
  });

  it("caps the discount at the subtotal and rounds tax to the paisa", () => {
    expect(computeQuote([{ quantity: 1, unitPricePaise: 1000 }], 5000, 0).total).toBe(0);
    expect(computeQuote([{ quantity: 3, unitPricePaise: 333 }], 0, 1800).tax).toBe(180); // 999 × 18% = 179.82
  });

  it.each([
    ["18", 1800],
    ["12.5", 1250],
    ["0", 0],
    ["50", 5000],
    ["51", null],
    ["abc", null],
    ["-5", null],
  ])("percentToBps(%s) = %s", (input, expected) => {
    expect(percentToBps(input)).toBe(expected);
  });

  it("applies the auspicious surcharge rounded to the rupee", () => {
    expect(applySurcharge(10_000_000, 1500)).toBe(11_500_000);
    expect(applySurcharge(12_345, 1000)).toBe(13_600);
    expect(applySurcharge(10_000_000, 0)).toBe(10_000_000);
  });

  it("reports the remaining hold time", () => {
    const now = new Date("2026-11-11T10:00:00Z");
    expect(holdRemaining("2026-11-13T10:00:00Z", now)).toEqual({ expired: false, hours: 48, minutes: 0 });
    expect(holdRemaining("2026-11-11T12:30:59Z", now)).toEqual({ expired: false, hours: 2, minutes: 30 });
    expect(holdRemaining("2026-11-11T09:00:00Z", now).expired).toBe(true);
  });
});

describe("enquiry form", () => {
  const base = {
    serviceId: UUID,
    date: "2027-02-14",
    startTime: "10:00",
    endTime: "22:00",
    guests: "300",
    message: "",
    idempotencyKey: UUID,
  };
  it("accepts a valid request", () => {
    expect(enquirySchema.safeParse(base).success).toBe(true);
  });
  it.each([
    [{ date: "2027-02-30" }, "date"],
    [{ startTime: "25:00" }, "startTime"],
    [{ endTime: "09:00" }, "endTime"],
    [{ guests: "0" }, "guests"],
    [{ message: "x".repeat(2001) }, "message"],
  ])("rejects %o", (patch, field) => {
    const r = enquirySchema.safeParse({ ...base, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(toFieldErrors(r.error))).toContain(field);
  });
});

describe("quote form", () => {
  const base = {
    enquiryId: UUID,
    items: [
      { description: "Hall for the day", quantity: "1", unitPrice: "1,00,000" },
      { description: "Chairs", quantity: "100", unitPrice: "50" },
    ],
    discount: "5,000",
    taxPercent: "18",
    validHours: "48",
    notes: "",
    terms: "Advance non-refundable",
  };
  it("converts to RPC arguments in paise and basis points", () => {
    expect(toQuotationArgs(quoteSchema.parse(base))).toEqual({
      p_enquiry_id: UUID,
      p_items: [
        { description: "Hall for the day", quantity: 1, unit_price_paise: 10_000_000 },
        { description: "Chairs", quantity: 100, unit_price_paise: 5_000 },
      ],
      p_discount_paise: 500_000,
      p_tax_bps: 1800,
      p_valid_hours: 48,
      p_notes: null,
      p_terms: "Advance non-refundable",
    });
  });
  it("requires at least one valid line", () => {
    expect(quoteSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(
      quoteSchema.safeParse({ ...base, items: [{ description: "", quantity: "1", unitPrice: "10" }] }).success,
    ).toBe(false);
    expect(quoteSchema.safeParse({ ...base, validHours: "0" }).success).toBe(false);
  });
});

describe("calendar entry", () => {
  it("converts IST wall-clock time to UTC", () => {
    expect(zonedToIso("2027-01-15", "10:00")).toBe("2027-01-15T04:30:00.000Z");
    expect(zonedToIso("2027-01-15", "00:15")).toBe("2027-01-14T18:45:00.000Z");
  });
  it("validates the time window", () => {
    const base = {
      resourceId: UUID,
      kind: "offline" as const,
      date: "2027-01-15",
      startTime: "09:00",
      endTime: "23:00",
      notes: "",
    };
    expect(calendarEntrySchema.safeParse(base).success).toBe(true);
    expect(calendarEntrySchema.safeParse({ ...base, endTime: "08:00" }).success).toBe(false);
  });
});
