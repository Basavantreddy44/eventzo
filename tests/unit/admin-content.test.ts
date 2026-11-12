import { describe, expect, it } from "vitest";
import { benchmarkFormSchema, toBenchmarkRow } from "@/features/budget/schemas";
import { parseEstimatorParams } from "@/features/budget/lib/params";
import {
  auspiciousDateFormSchema,
  formatWindows,
  parseWindows,
  toAuspiciousDateRow,
} from "@/features/muhurtham/schemas";
import { toFieldErrors } from "@/features/auth/schemas";

const UUID = "0b6c1c38-4a3e-4c55-9d43-5d0d7b7d3a11";

describe("benchmark form", () => {
  const base = {
    businessCategoryId: UUID,
    cityId: UUID,
    unit: "per_guest" as const,
    low: "250",
    high: "1,200.50",
    notes: "",
    source: "Team survey Nov 2026",
    isPublished: true,
  };

  it("converts rupees to paise", () => {
    const row = toBenchmarkRow(benchmarkFormSchema.parse(base));
    expect(row).toMatchObject({
      low_paise: 25_000,
      high_paise: 120_050,
      notes: null,
      unit: "per_guest",
      is_published: true,
    });
  });

  it("rejects a high below the low", () => {
    const result = benchmarkFormSchema.safeParse({ ...base, low: "5000", high: "100" });
    expect(result.success).toBe(false);
    if (!result.success) expect(toFieldErrors(result.error).high).toBe("validation.priceRange");
  });

  it("rejects non-numeric amounts", () => {
    const result = benchmarkFormSchema.safeParse({ ...base, low: "lots" });
    expect(result.success).toBe(false);
    if (!result.success) expect(toFieldErrors(result.error).low).toBe("validation.amount");
  });
});

describe("muhurtham windows", () => {
  it("parses one window per line", () => {
    expect(parseWindows("06:45-08:15\n 11:05 – 12:20 \n")).toEqual([
      { start: "06:45", end: "08:15" },
      { start: "11:05", end: "12:20" },
    ]);
    expect(parseWindows("")).toEqual([]);
    expect(formatWindows([{ start: "06:45", end: "08:15" }])).toBe("06:45-08:15");
  });

  it.each(["6:45-8:15", "08:15-06:45", "24:00-25:00", "morning", "06:45"])("rejects %s", (v) => {
    expect(parseWindows(v)).toBeNull();
  });
});

describe("auspicious date form", () => {
  const base = {
    date: "2027-02-14",
    cityId: "",
    title: "Magha Shuddha Panchami",
    notes: "",
    significance: "3" as const,
    windows: "06:45-08:15",
    source: "Family panchang",
    isPublished: false,
  };

  it("maps to a row (empty city = all cities)", () => {
    expect(toAuspiciousDateRow(auspiciousDateFormSchema.parse(base))).toEqual({
      date: "2027-02-14",
      city_id: null,
      title: "Magha Shuddha Panchami",
      notes: null,
      significance: 3,
      muhurtham_windows: [{ start: "06:45", end: "08:15" }],
      source: "Family panchang",
      is_published: false,
    });
  });

  it.each([
    [{ date: "2027-02-30" }, "date"],
    [{ date: "14-02-2027" }, "date"],
    [{ title: "x" }, "title"],
    [{ windows: "dawn" }, "windows"],
    [{ cityId: "kalaburagi" }, "cityId"],
  ])("rejects %o", (patch, field) => {
    const result = auspiciousDateFormSchema.safeParse({ ...base, ...patch });
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(toFieldErrors(result.error))).toContain(field);
  });
});

describe("estimator params", () => {
  it("parses city, guests and repeated categories", () => {
    expect(
      parseEstimatorParams({ city: "Bengaluru", guests: "450", c: ["venues", "catering", "venues", "bad slug!"] }),
    ).toEqual({
      city: "bengaluru",
      guests: 450,
      categories: ["venues", "catering"],
    });
  });

  it("drops invalid values", () => {
    expect(parseEstimatorParams({ city: "../x", guests: "0", c: "catering" })).toEqual({
      city: undefined,
      guests: undefined,
      categories: ["catering"],
    });
    expect(parseEstimatorParams({ guests: "999999999" }).guests).toBeUndefined();
  });
});
