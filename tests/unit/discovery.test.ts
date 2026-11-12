import { describe, expect, it } from "vitest";
import { parseSearchParams, toSearchQuery } from "@/features/discovery/lib/search-params";
import { formatListingPrice, type PriceTranslator } from "@/features/discovery/lib/price";
import { estimateBudget } from "@/features/budget/lib/estimate";
import { addMonths, monthGrid, monthRange, parseMonth, todayIn } from "@/features/muhurtham/lib/calendar";
import { listingMediaUrl } from "@/lib/storage";

describe("parseSearchParams", () => {
  it("parses valid filters", () => {
    expect(
      parseSearchParams({
        q: " kalyana mantapa ",
        city: "Kalaburagi",
        category: "venues",
        guests: "500",
        max: "2,00,000",
        sort: "price_asc",
        page: "2",
      }),
    ).toEqual({
      q: "kalyana mantapa",
      city: "kalaburagi",
      category: "venues",
      service: undefined,
      guests: 500,
      maxPricePaise: 20_000_000,
      sort: "price_asc",
      page: 2,
    });
  });

  it("defaults the sort to relevance with a query and recommended without", () => {
    expect(parseSearchParams({ q: "hall" }).sort).toBe("relevance");
    expect(parseSearchParams({}).sort).toBe("recommended");
  });

  it.each([
    [{ city: "../etc" }, "city"],
    [{ category: "venues; drop table" }, "category"],
    [{ guests: "-5" }, "guests"],
    [{ guests: "0" }, "guests"],
    [{ guests: "1e9" }, "guests"],
    [{ max: "abc" }, "maxPricePaise"],
    [{ max: "0" }, "maxPricePaise"],
  ])("drops invalid %o", (raw, key) => {
    expect(parseSearchParams(raw)[key as keyof ReturnType<typeof parseSearchParams>]).toBeUndefined();
  });

  it("clamps the page and ignores unknown sorts", () => {
    expect(parseSearchParams({ page: "9999" }).page).toBe(1);
    expect(parseSearchParams({ sort: "random" }).sort).toBe("recommended");
    expect(parseSearchParams({ q: "x".repeat(300) }).q).toHaveLength(100);
  });

  it("round-trips through toSearchQuery, omitting defaults", () => {
    const filters = parseSearchParams({ city: "bengaluru", guests: "200", max: "500", page: "3" });
    expect(toSearchQuery(filters)).toEqual({ city: "bengaluru", guests: "200", max: "500", page: "3" });
    expect(toSearchQuery(parseSearchParams({}))).toEqual({});
  });
});

describe("formatListingPrice", () => {
  const t: PriceTranslator = (key, values) => {
    const table: Record<string, string> = {
      onRequest: "Price on request",
      fixed: "{amount}",
      from: "From {amount}",
      range: "{min} – {max}",
      "unit.per_day": "/ day",
      "unit.per_plate": "/ plate",
    };
    return (table[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => values?.[k] ?? "");
  };

  it("formats each price type", () => {
    expect(
      formatListingPrice(
        { price_type: "starting_from", price_unit: "per_day", base_price_paise: 15_000_000, max_price_paise: null },
        t,
      ),
    ).toBe("From ₹1,50,000 / day");
    expect(
      formatListingPrice(
        { price_type: "range", price_unit: "per_day", base_price_paise: 30_000_000, max_price_paise: 60_000_000 },
        t,
      ),
    ).toBe("₹3,00,000 – ₹6,00,000 / day");
    expect(
      formatListingPrice(
        { price_type: "fixed", price_unit: "per_plate", base_price_paise: 45_050, max_price_paise: null },
        t,
      ),
    ).toBe("₹450.50 / plate");
    expect(
      formatListingPrice(
        { price_type: "on_request", price_unit: null, base_price_paise: null, max_price_paise: null },
        t,
      ),
    ).toBe("Price on request");
  });
});

describe("estimateBudget", () => {
  const benchmarks = [
    { categorySlug: "venues", unit: "per_event" as const, lowPaise: 5_000_000, highPaise: 30_000_000 },
    { categorySlug: "catering", unit: "per_guest" as const, lowPaise: 20_000, highPaise: 50_000 },
  ];

  it("multiplies per-guest ranges by guests and adds per-event ranges", () => {
    const e = estimateBudget({ guests: 500, categories: ["venues", "catering"], benchmarks });
    expect(e.lines).toEqual([
      { categorySlug: "venues", unit: "per_event", lowPaise: 5_000_000, highPaise: 30_000_000, available: true },
      { categorySlug: "catering", unit: "per_guest", lowPaise: 10_000_000, highPaise: 25_000_000, available: true },
    ]);
    expect(e.totalLowPaise).toBe(15_000_000);
    expect(e.totalHighPaise).toBe(55_000_000);
    expect(e.missing).toEqual([]);
  });

  it("reports categories with no published range and excludes them from totals", () => {
    const e = estimateBudget({ guests: 100, categories: ["catering", "mehendi", "catering"], benchmarks });
    expect(e.missing).toEqual(["mehendi"]);
    expect(e.lines).toHaveLength(2);
    expect(e.totalLowPaise).toBe(2_000_000);
  });

  it("clamps the guest count", () => {
    expect(estimateBudget({ guests: 0, categories: ["catering"], benchmarks }).totalLowPaise).toBe(20_000);
    expect(estimateBudget({ guests: 10_000_000, categories: ["catering"], benchmarks }).totalLowPaise).toBe(
      20_000 * 100_000,
    );
  });
});

describe("muhurtham calendar", () => {
  it("builds a Sunday-first month grid", () => {
    // 1 Dec 2026 is a Tuesday
    const weeks = monthGrid({ year: 2026, month: 12 });
    expect(weeks[0]).toEqual([null, null, "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("supports Monday-first weeks", () => {
    expect(monthGrid({ year: 2026, month: 12 }, 1)[0][0]).toBeNull();
    expect(monthGrid({ year: 2026, month: 12 }, 1)[0][1]).toBe("2026-12-01");
  });

  it("parses, moves and bounds months", () => {
    expect(parseMonth("2027-02", "2026-11-11")).toEqual({ year: 2027, month: 2 });
    expect(parseMonth("2027-13", "2026-11-11")).toEqual({ year: 2026, month: 11 });
    expect(parseMonth(undefined, "2026-11-11")).toEqual({ year: 2026, month: 11 });
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
    expect(monthRange({ year: 2028, month: 2 })).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("computes today in IST", () => {
    // 20:00 UTC on 10 Nov is already 11 Nov in Kolkata
    expect(todayIn("Asia/Kolkata", new Date("2026-11-10T20:00:00Z"))).toBe("2026-11-11");
  });
});

describe("listingMediaUrl", () => {
  it("builds an encoded public URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321/";
    expect(listingMediaUrl("org-id/photo 1.jpg")).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/listing-media/org-id/photo%201.jpg",
    );
  });
});
