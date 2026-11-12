import { describe, expect, it } from "vitest";
import {
  loginSchema,
  passwordSchema,
  registerSchema,
  resetPasswordSchema,
  toFieldErrors,
} from "@/features/auth/schemas";
import { normalizePhone, profileSchema } from "@/features/account/schemas";
import { branchSelectionSchema, createOrganizationSchema } from "@/features/organizations/schemas";

const UUID = "0b6c1c38-4a3e-4c55-9d43-5d0d7b7d3a11";

describe("auth schemas", () => {
  it("normalises email and requires a password on login", () => {
    const parsed = loginSchema.parse({ email: "  Priya@Example.COM ", password: "x" });
    expect(parsed.email).toBe("priya@example.com");
    expect(loginSchema.safeParse({ email: "priya@example.com", password: "" }).success).toBe(false);
  });

  it("rejects invalid emails with an i18n key", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
    if (!result.success) expect(toFieldErrors(result.error).email).toBe("validation.email");
  });

  it.each([
    ["short1", "validation.passwordMin"],
    ["lettersonly", "validation.passwordLettersDigits"],
    ["12345678", "validation.passwordLettersDigits"],
    ["a1".repeat(37), "validation.passwordMax"],
  ])("rejects weak password %s", (password, key) => {
    const result = passwordSchema.safeParse(password);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((i) => i.message)).toContain(key);
  });

  it("accepts a strong password", () => {
    expect(passwordSchema.safeParse("mantapa2027").success).toBe(true);
  });

  it("register requires matching passwords and a name", () => {
    const ok = registerSchema.safeParse({
      fullName: "Priya Patil",
      email: "priya@example.com",
      password: "mantapa2027",
      confirmPassword: "mantapa2027",
      locale: "kn",
    });
    expect(ok.success).toBe(true);

    const mismatch = registerSchema.safeParse({
      fullName: "Priya",
      email: "priya@example.com",
      password: "mantapa2027",
      confirmPassword: "mantapa2028",
    });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(toFieldErrors(mismatch.error).confirmPassword).toBe("validation.passwordsMismatch");
  });

  it("register defaults the locale and rejects unknown locales", () => {
    const base = { fullName: "Ravi", email: "ravi@example.com", password: "abc12345", confirmPassword: "abc12345" };
    expect(registerSchema.parse(base).locale).toBe("en");
    expect(registerSchema.safeParse({ ...base, locale: "fr" }).success).toBe(false);
  });

  it("reset requires matching passwords", () => {
    expect(resetPasswordSchema.safeParse({ password: "abc12345", confirmPassword: "abc12345" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: "abc12345", confirmPassword: "abc1234" }).success).toBe(false);
  });
});

describe("phone normalisation (E.164)", () => {
  it.each([
    ["98450 12345", "+919845012345"],
    ["098450-12345", "+919845012345"],
    ["91 9845012345", "+919845012345"],
    ["+91 98450 12345", "+919845012345"],
    ["(984) 501-2345", "+919845012345"],
    ["0044 20 7946 0958", "+442079460958"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["12345", "abcdefghij", "+0123456789", "55555 55555"])("rejects %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it("profile allows an empty phone but not an invalid one", () => {
    const base = { fullName: "Asha", displayName: "", preferredLocale: "hi" as const };
    expect(profileSchema.safeParse({ ...base, phone: "" }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, phone: "12" }).success).toBe(false);
  });
});

describe("organisation schemas", () => {
  it("validates onboarding input", () => {
    const valid = { name: "Sri Lakshmi Kalyana Mantapa", businessCategoryId: UUID, cityId: UUID, idempotencyKey: UUID };
    expect(createOrganizationSchema.safeParse(valid).success).toBe(true);
    expect(createOrganizationSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ ...valid, cityId: "" }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ ...valid, idempotencyKey: "short" }).success).toBe(false);
  });

  it("branch selection is 'all' or a uuid", () => {
    expect(branchSelectionSchema.safeParse("all").success).toBe(true);
    expect(branchSelectionSchema.safeParse(UUID).success).toBe(true);
    expect(branchSelectionSchema.safeParse("main").success).toBe(false);
  });
});
