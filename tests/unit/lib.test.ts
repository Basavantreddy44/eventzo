import { describe, expect, it } from "vitest";
import { mapDbError } from "@/lib/errors";
import { formatPaise, rupeesToPaise } from "@/lib/money";
import { formatDateTime, parseTstzRange } from "@/lib/datetime";
import { mapAuthError } from "@/features/auth/lib/map-auth-error";
import { mergeMessages } from "@/i18n/merge-messages";

describe("mapDbError", () => {
  it.each([
    ["42501", "forbidden"],
    ["23P01", "conflict"],
    ["22023", "invalidInput"],
    ["23514", "invalidInput"],
    ["54000", "limitReached"],
    ["P0002", "notFound"],
    ["PGRST116", "notFound"],
    ["XX000", "unknown"],
  ])("%s → %s", (code, key) => {
    expect(mapDbError({ code })).toBe(key);
  });
  it("handles a missing error", () => {
    expect(mapDbError(null)).toBe("unknown");
  });
});

describe("mapAuthError", () => {
  it("maps known Supabase auth codes", () => {
    expect(mapAuthError({ code: "invalid_credentials" })).toBe("auth.errors.invalidCredentials");
    expect(mapAuthError({ code: "email_not_confirmed" })).toBe("auth.errors.emailNotConfirmed");
    expect(mapAuthError({ code: "user_already_exists" })).toBe("auth.errors.emailTaken");
    expect(mapAuthError({ code: "weak_password" })).toBe("auth.errors.weakPassword");
    expect(mapAuthError({ code: "otp_expired" })).toBe("auth.errors.linkInvalid");
  });
  it("treats HTTP 429 as rate limiting and anything else as generic", () => {
    expect(mapAuthError({ status: 429 })).toBe("auth.errors.rateLimited");
    expect(mapAuthError({ code: "something_new" })).toBe("auth.errors.generic");
  });
});

describe("money (integer paise, D6)", () => {
  it.each([
    ["1,25,000", 12_500_000n],
    ["₹ 499.5", 49_950n],
    ["0.05", 5n],
    ["100", 10_000n],
  ])("parses %s", (input, paise) => {
    expect(rupeesToPaise(input)).toBe(paise);
  });

  it.each(["", "abc", "1.234", "-5", "1e3"])("rejects %s", (input) => {
    expect(rupeesToPaise(input)).toBeNull();
  });

  it("formats with Indian digit grouping and no float drift", () => {
    expect(formatPaise(12_500_050n)).toBe("₹1,25,000.50");
    expect(formatPaise(12_500_000n)).toBe("₹1,25,000");
    expect(formatPaise(12_500_000n, { hideZeroDecimals: false })).toBe("₹1,25,000.00");
    // 2^53 + 1 paise would lose precision as a float
    expect(formatPaise(9_007_199_254_740_993n)).toBe("₹9,00,71,99,25,47,409.93");
  });
});

describe("datetime", () => {
  it("parses Postgres tstzrange literals", () => {
    const r = parseTstzRange('["2027-01-15 04:30:00+00","2027-01-15 08:30:00+00")');
    expect(r?.start.toISOString()).toBe("2027-01-15T04:30:00.000Z");
    expect(r?.end.toISOString()).toBe("2027-01-15T08:30:00.000Z");
    expect(parseTstzRange("garbage")).toBeNull();
    const ist = parseTstzRange('["2027-01-15 10:00:00+05:30","2027-01-15 14:00:00+05:30")');
    expect(ist?.start.toISOString()).toBe("2027-01-15T04:30:00.000Z");
  });

  it("renders in Asia/Kolkata by default", () => {
    const text = formatDateTime("2027-01-15T04:30:00Z", "en", undefined, { timeStyle: "short" });
    expect(text.toLowerCase()).toContain("10:00");
  });
});

describe("mergeMessages", () => {
  it("falls back to English for missing or empty translations", () => {
    const merged = mergeMessages(
      { nav: { home: "Home", login: "Log in" }, brand: { name: "Eventzo" } },
      { nav: { home: "ಮುಖಪುಟ", login: "" } },
    );
    expect(merged).toEqual({ nav: { home: "ಮುಖಪುಟ", login: "Log in" }, brand: { name: "Eventzo" } });
  });
});
