import { describe, expect, it } from "vitest";
import { cleanPersonName, personNameSchema } from "@/lib/names";

describe("cleanPersonName (QA B13)", () => {
  it("drops stray separators and extra spaces", () => {
    expect(cleanPersonName("QA Retest Customer,")).toBe("QA Retest Customer");
    expect(cleanPersonName("  , Asha   Rao ; ")).toBe("Asha Rao");
    expect(cleanPersonName("S. Rao")).toBe("S. Rao");
    expect(cleanPersonName("Rao, Asha")).toBe("Rao, Asha");
  });

  it("validates length after tidying", () => {
    expect(personNameSchema(2).safeParse(" ,a, ").success).toBe(false);
    expect(personNameSchema(2).parse("Asha,")).toBe("Asha");
  });
});
