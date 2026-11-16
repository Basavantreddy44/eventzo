import { describe, expect, it } from "vitest";
import { packageSchema } from "@/features/vendor/schemas";

const UUID = "0b6c1c38-4a3e-4c55-9d43-5d0d7b7d3a11";
const base = {
  id: "",
  serviceId: UUID,
  name: "Gold wedding package",
  description: "",
  price: "2,50,000",
  priceUnit: "" as const,
  includes: "",
  excludes: "",
};

describe("listing packages (Roadmap C6/V4)", () => {
  it("turns one-item-per-line text into clean lists", () => {
    const v = packageSchema.parse({
      ...base,
      includes: "• Hall for 12 hours\n\n- 300 veg plates \n✓ Stage décor",
      excludes: "Nadaswaram",
    });
    expect(v.includes).toEqual(["Hall for 12 hours", "300 veg plates", "Stage décor"]);
    expect(v.excludes).toEqual(["Nadaswaram"]);
  });

  it("checks name, price and line limits", () => {
    expect(packageSchema.safeParse({ ...base, name: "G" }).success).toBe(false);
    expect(packageSchema.safeParse({ ...base, price: "" }).success).toBe(false);
    expect(packageSchema.safeParse({ ...base, price: "abc" }).success).toBe(false);
    expect(packageSchema.safeParse({ ...base, includes: "x".repeat(81) }).success).toBe(false);
    expect(
      packageSchema.safeParse({ ...base, includes: Array.from({ length: 21 }, (_, i) => `Item ${i}`).join("\n") })
        .success,
    ).toBe(false);
    expect(packageSchema.safeParse({ ...base, priceUnit: "per_plate" }).success).toBe(true);
  });
});
