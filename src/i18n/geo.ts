/**
 * Roadmap C12: first-time visitors from Kannada-first cities open in Kannada.
 * Uses the city Vercel derives from the visitor's IP (`x-vercel-ip-city`, URL-
 * encoded). A saved language choice (NEXT_LOCALE cookie) always wins, so
 * anyone who picks English in the switcher stays in English.
 * Override the list with KANNADA_FIRST_CITIES (comma-separated, any case).
 */
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const DEFAULT_KANNADA_FIRST_CITIES = ["kalaburagi", "gulbarga"];

export function kannadaFirstCities(env: string | undefined = process.env.KANNADA_FIRST_CITIES): string[] {
  const list = (env ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : DEFAULT_KANNADA_FIRST_CITIES;
}

function decodeCity(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** Paths that switch to Kannada for such visitors: the public site and the customer account. */
function isCustomerPath(path: string): boolean {
  return !/^\/(vendor|admin|staff|api|auth|receipts)(\/|$)/.test(path);
}

export function shouldOpenInKannada(input: {
  method: string;
  /** Path without a locale prefix, e.g. "/" or "/search". */
  path: string;
  /** True when the URL already carries a locale prefix (/kn, /hi). */
  prefixed: boolean;
  savedLocale: string | undefined;
  cityHeader: string | null;
  cities?: string[];
}): boolean {
  if (input.method !== "GET" || input.prefixed || input.savedLocale) return false;
  if (!isCustomerPath(input.path)) return false;
  const city = decodeCity(input.cityHeader);
  return !!city && (input.cities ?? kannadaFirstCities()).includes(city);
}
