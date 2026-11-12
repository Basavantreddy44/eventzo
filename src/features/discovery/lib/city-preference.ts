import "server-only";

import { cookies } from "next/headers";

export const CITY_COOKIE = "ez_city";
const CITY_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The visitor's remembered city (no default until the launch city is decided, D7). */
export async function getPreferredCitySlug(): Promise<string | null> {
  const value = (await cookies()).get(CITY_COOKIE)?.value;
  return value && value.length <= 40 && CITY_SLUG.test(value) ? value : null;
}
