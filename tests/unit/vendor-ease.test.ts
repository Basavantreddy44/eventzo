import { describe, expect, it } from "vitest";
import { parseScorecard, responseBadgeHours, scorecardView } from "@/features/vendor/lib/scorecard";
import { isKnownKind } from "@/features/notifications/lib/templates";
import en from "../../messages/en.json";

const base = parseScorecard({
  response_median_minutes: 90,
  answered: 9,
  enquiries: 10,
  quoted: 8,
  won: 4,
  rating: "4.6",
  reviews: 5,
  vendor_cancellations: 0,
});

describe("V9 score card", () => {
  it("parses the database JSON (numbers may arrive as strings or null)", () => {
    expect(base.rating).toBe(4.6);
    expect(parseScorecard(null)).toMatchObject({ response_median_minutes: null, answered: 0, rating: null });
  });

  it("shows hours and the quote-to-booking rate", () => {
    const v = scorecardView(base);
    expect(v.responseHours).toBe(2);
    expect(v.conversionPercent).toBe(50);
    expect(Object.values(v.weak).some(Boolean)).toBe(false);
  });

  it("flags slow replies, few bookings, a low rating and any cancellation", () => {
    const v = scorecardView({
      ...base,
      response_median_minutes: 15 * 60,
      quoted: 10,
      won: 1,
      rating: 3.1,
      vendor_cancellations: 1,
    });
    expect(v.weak).toEqual({ response: true, conversion: true, rating: true, cancellations: true });
  });

  it("doesn't judge on too little data", () => {
    const v = scorecardView({ ...base, quoted: 2, won: 0, reviews: 1, rating: 2 });
    expect(v.weak.conversion).toBe(false);
    expect(v.weak.rating).toBe(false);
    expect(scorecardView({ ...base, quoted: 0 }).conversionPercent).toBeNull();
  });

  it("flags vendors who leave most enquiries unanswered", () => {
    expect(scorecardView({ ...base, answered: 2, enquiries: 10 }).weak.response).toBe(true);
  });
});

describe("V5 response badge", () => {
  it("rounds up to whole hours, at least one", () => {
    expect(responseBadgeHours(null)).toBeNull();
    expect(responseBadgeHours(5)).toBe(1);
    expect(responseBadgeHours(61)).toBe(2);
  });
});

describe("batch C1 notifications", () => {
  it("are known and have English text", () => {
    for (const k of [
      "enquiry.hold_expiring",
      "enquiry.follow_up",
      "vendor.changes_requested",
      "vendor.rejected",
      "vendor.verified",
    ]) {
      expect(isKnownKind(k)).toBe(true);
      const [g, n] = k.split(".");
      expect((en.notifications.kinds as Record<string, Record<string, string>>)[g][n]).toBeTruthy();
    }
  });
});
