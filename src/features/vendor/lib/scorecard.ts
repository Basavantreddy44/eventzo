/** `vendor_scorecard()` — see migration 20261123000200_vendor_ease.sql (last 90 days). */
export type Scorecard = {
  response_median_minutes: number | null;
  answered: number;
  enquiries: number;
  quoted: number;
  won: number;
  rating: number | null;
  reviews: number;
  vendor_cancellations: number;
};

export function parseScorecard(raw: unknown): Scorecard {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  return {
    response_median_minutes: num(o.response_median_minutes),
    answered: Number(o.answered ?? 0),
    enquiries: Number(o.enquiries ?? 0),
    quoted: Number(o.quoted ?? 0),
    won: Number(o.won ?? 0),
    rating: num(o.rating),
    reviews: Number(o.reviews ?? 0),
    vendor_cancellations: Number(o.vendor_cancellations ?? 0),
  };
}

/**
 * Display values and "needs attention" flags. Thresholds: replies slower than
 * 12 h, fewer than 1 in 5 quotes booked (after 5 quotes), rating under 3.5
 * (after 3 reviews), any vendor cancellation.
 */
export function scorecardView(s: Scorecard) {
  const responseHours =
    s.response_median_minutes == null ? null : Math.max(1, Math.round(s.response_median_minutes / 60));
  const conversionPercent = s.quoted > 0 ? Math.round((s.won / s.quoted) * 100) : null;
  return {
    responseHours,
    conversionPercent,
    weak: {
      response: (s.response_median_minutes ?? 0) > 12 * 60 || (s.enquiries > 0 && s.answered < s.enquiries / 2),
      conversion: s.quoted >= 5 && (conversionPercent ?? 0) < 20,
      rating: s.reviews >= 3 && (s.rating ?? 5) < 3.5,
      cancellations: s.vendor_cancellations > 0,
    },
  };
}

/** "Usually replies within …" for a listing: hours, rounded up, at least 1. */
export function responseBadgeHours(medianMinutes: number | null): number | null {
  return medianMinutes == null ? null : Math.max(1, Math.ceil(medianMinutes / 60));
}
