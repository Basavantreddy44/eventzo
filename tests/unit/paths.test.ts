import { describe, expect, it } from "vitest";
import { isProtectedPath, safeNextPath, stripLocale } from "@/lib/auth/paths";

describe("stripLocale", () => {
  it("removes a known locale prefix", () => {
    expect(stripLocale("/kn/vendor/calendar")).toEqual({ locale: "kn", path: "/vendor/calendar" });
    expect(stripLocale("/hi")).toEqual({ locale: "hi", path: "/" });
  });
  it("treats unprefixed paths as the default locale", () => {
    expect(stripLocale("/admin")).toEqual({ locale: "en", path: "/admin" });
    expect(stripLocale("/")).toEqual({ locale: "en", path: "/" });
  });
  it("doesn't mistake look-alike segments for locales", () => {
    expect(stripLocale("/kname")).toEqual({ locale: "en", path: "/kname" });
  });
});

describe("isProtectedPath", () => {
  it.each(["/account", "/vendor", "/vendor/bookings", "/admin", "/admin/audit"])("protects %s", (p) => {
    expect(isProtectedPath(p)).toBe(true);
  });
  it.each(["/", "/login", "/register", "/become-a-vendor", "/vendors", "/administrator", "/accounting"])(
    "leaves %s public",
    (p) => {
      expect(isProtectedPath(p)).toBe(false);
    },
  );
});

describe("safeNextPath (open-redirect protection)", () => {
  it("keeps same-origin paths with query and hash", () => {
    expect(safeNextPath("/kn/vendor?tab=1#x")).toBe("/kn/vendor?tab=1#x");
  });
  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "vendor",
    "",
    null,
    undefined,
    "/\u0000evil",
  ])("rejects %s", (value) => {
    expect(safeNextPath(value as string | null | undefined, "/account")).toBe("/account");
  });
});
