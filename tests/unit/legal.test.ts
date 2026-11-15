import { describe, expect, it } from "vitest";
import { isDraftVersion, isLegalSlug, LEGAL_PAGES } from "@/features/legal/lib/policies";

describe("legal pages (Roadmap A8)", () => {
  it("maps the four public slugs to policy types", () => {
    expect(Object.keys(LEGAL_PAGES)).toEqual(["terms", "privacy", "refunds", "vendor-agreement"]);
    expect(isLegalSlug("privacy")).toBe(true);
    expect(isLegalSlug("cookies")).toBe(false);
  });

  it("treats versions below 1.0 as drafts", () => {
    expect(isDraftVersion("0.1")).toBe(true);
    expect(isDraftVersion("1.0")).toBe(false);
    expect(isDraftVersion("2.3.1")).toBe(false);
  });
});
