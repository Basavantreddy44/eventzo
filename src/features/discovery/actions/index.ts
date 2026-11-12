"use server";

import { cookies } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { getActiveCities } from "@/features/taxonomy/queries";
import { CITY_COOKIE } from "../lib/city-preference";

/** Remembers (or clears, with null) the visitor's city. Only active cities are accepted. */
export async function setPreferredCity(slug: string | null): Promise<ActionResult> {
  const store = await cookies();
  if (slug === null) {
    store.delete(CITY_COOKIE);
    return ok(undefined);
  }
  const cities = await getActiveCities();
  if (!cities.some((c) => c.slug === slug)) return fail("errors.invalidInput");

  store.set(CITY_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return ok(undefined);
}
