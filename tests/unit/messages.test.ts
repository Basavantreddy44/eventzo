import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import kn from "../../messages/kn.json";
import hi from "../../messages/hi.json";

type Tree = { [key: string]: string | Tree };

function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === "string" ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

const enKeys = new Set(keys(en as Tree));

describe("i18n catalogues (enhancement D)", () => {
  it.each([
    ["kn", kn],
    ["hi", hi],
  ])("%s only contains keys that exist in English", (_, catalogue) => {
    const stray = keys(catalogue as Tree).filter((k) => !enKeys.has(k));
    expect(stray).toEqual([]);
  });

  it("English has no empty strings", () => {
    const empty = keys(en as Tree).filter((k) => {
      const value = k.split(".").reduce<unknown>((node, part) => (node as Tree)[part], en);
      return typeof value === "string" && value.trim() === "";
    });
    expect(empty).toEqual([]);
  });
});
