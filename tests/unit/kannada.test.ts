import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import kn from "../../messages/kn.json";
import { DEFAULT_KANNADA_FIRST_CITIES, kannadaFirstCities, shouldOpenInKannada } from "@/i18n/geo";

type Tree = { [key: string]: string | Tree };

function entries(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [[prefix + k, v] as [string, string]] : entries(v, `${prefix}${k}.`),
  );
}

/** Top-level ICU arguments and rich-text tags (plural branch text ignored). */
function tokens(s: string): string {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{") {
      if (depth === 0) {
        const m = /^\{\s*([a-zA-Z_][a-zA-Z0-9_]*)/.exec(s.slice(i));
        if (m) names.add(m[1]);
      }
      depth++;
    } else if (s[i] === "}") depth--;
  }
  for (const m of s.matchAll(/<\/?([a-zA-Z]+)>/g)) names.add(`<${m[1]}>`);
  return [...names].sort().join("|");
}

// Everything a customer sees. Vendor/admin-only texts fall back to English for now.
const CUSTOMER_NAMESPACES = [
  "common",
  "auth",
  "errors",
  "city",
  "home",
  "search",
  "status",
  "listing",
  "muhurtham",
  "estimator",
  "enquiry",
  "shortlist",
  "account",
  "legal",
  "quote",
  "enquiries",
  "rsvp",
  "receipt",
];
const CUSTOMER_KEYS_IN_MIXED = [
  /^bookings\.(?!enquiryBookedVendor|reasonNeeded)/,
  /^events\./,
  /^reviews\.(?!admin\.|hide|restore|reasonRequired|hiddenToast|restoredToast)/,
  /^support\.(topics|statuses)\./,
  /^notifications\.(?!kinds\.(job|vendor)\.)/,
];
const OPTIONAL = new Set(["common.none"]);

const enEntries = entries(en as Tree);
const knMap = new Map(entries(kn as Tree));

describe("Kannada for the customer path (Roadmap C12)", () => {
  const required = enEntries.filter(
    ([k]) =>
      !OPTIONAL.has(k) &&
      (CUSTOMER_NAMESPACES.includes(k.split(".")[0]) || CUSTOMER_KEYS_IN_MIXED.some((r) => r.test(k))),
  );

  it("covers every customer-facing text", () => {
    const missing = required
      .map(([k]) => k)
      .filter((k) => !knMap.has(k))
      // Admin-entered formats that read the same in any language.
      .filter((k) => !k.startsWith("validation."));
    expect(missing).toEqual([]);
  });

  it("keeps every placeholder and tag of the English text", () => {
    const wrong = enEntries.filter(([k, v]) => knMap.has(k) && tokens(knMap.get(k)!) !== tokens(v)).map(([k]) => k);
    expect(wrong).toEqual([]);
  });
});

describe("Kalaburagi visitors open in Kannada", () => {
  const base = { method: "GET", path: "/", prefixed: false, savedLocale: undefined, cityHeader: "Gulbarga" };

  it("on a first visit from Kalaburagi / Gulbarga", () => {
    expect(shouldOpenInKannada(base)).toBe(true);
    expect(shouldOpenInKannada({ ...base, cityHeader: "Kalaburagi", path: "/search" })).toBe(true);
    expect(shouldOpenInKannada({ ...base, cityHeader: "Kalaburagi%20" })).toBe(true);
  });

  it("never over a saved choice, an explicit language URL, other cities or the vendor/admin portals", () => {
    expect(shouldOpenInKannada({ ...base, savedLocale: "en" })).toBe(false);
    expect(shouldOpenInKannada({ ...base, prefixed: true })).toBe(false);
    expect(shouldOpenInKannada({ ...base, cityHeader: "Bengaluru" })).toBe(false);
    expect(shouldOpenInKannada({ ...base, cityHeader: null })).toBe(false);
    expect(shouldOpenInKannada({ ...base, path: "/vendor/bookings" })).toBe(false);
    expect(shouldOpenInKannada({ ...base, path: "/admin" })).toBe(false);
    expect(shouldOpenInKannada({ ...base, method: "POST" })).toBe(false);
  });

  it("the city list can be changed by configuration", () => {
    expect(kannadaFirstCities(undefined)).toEqual(DEFAULT_KANNADA_FIRST_CITIES);
    expect(kannadaFirstCities(" Bengaluru, Mysuru ")).toEqual(["bengaluru", "mysuru"]);
    expect(shouldOpenInKannada({ ...base, cityHeader: "Bengaluru", cities: kannadaFirstCities("bengaluru") })).toBe(
      true,
    );
  });
});
