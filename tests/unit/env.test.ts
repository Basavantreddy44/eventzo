import { afterEach, describe, expect, it, vi } from "vitest";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
};

async function siteUrlWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries({
    ...base,
    NEXT_PUBLIC_SITE_URL: undefined,
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
    ...env,
  })) {
    if (v === undefined) vi.stubEnv(k, "");
    else vi.stubEnv(k, v);
  }
  const { getPublicEnv } = await import("@/lib/env");
  return getPublicEnv().NEXT_PUBLIC_SITE_URL;
}

describe("site URL (QA B1, B6)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses NEXT_PUBLIC_SITE_URL when set", async () => {
    expect(
      await siteUrlWith({
        NEXT_PUBLIC_SITE_URL: "https://eventzo.in",
        VERCEL_PROJECT_PRODUCTION_URL: "eventzo-two.vercel.app",
      }),
    ).toBe("https://eventzo.in");
  });

  it("falls back to the Vercel production domain, not localhost", async () => {
    expect(await siteUrlWith({ VERCEL_PROJECT_PRODUCTION_URL: "eventzo-two.vercel.app" })).toBe(
      "https://eventzo-two.vercel.app",
    );
  });

  it("uses localhost only outside Vercel with nothing set", async () => {
    expect(await siteUrlWith({})).toBe("http://localhost:3000");
  });
});
