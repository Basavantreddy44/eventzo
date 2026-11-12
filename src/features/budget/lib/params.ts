import { MAX_GUESTS } from "./estimate";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type EstimatorParams = { city?: string; guests?: number; categories: string[] };

/** /budget-estimator?city=kalaburagi&guests=500&c=venues&c=catering */
export function parseEstimatorParams(raw: Record<string, string | string[] | undefined>): EstimatorParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase();
  const city = one(raw.city);
  const guestsRaw = one(raw.guests);
  const guests = guestsRaw && /^\d{1,7}$/.test(guestsRaw) ? Number(guestsRaw) : undefined;
  const list = raw.c === undefined ? [] : Array.isArray(raw.c) ? raw.c : [raw.c];
  const categories = [
    ...new Set(list.map((c) => c.trim().toLowerCase()).filter((c) => c.length <= 60 && SLUG.test(c))),
  ].slice(0, 20);

  return {
    city: city && city.length <= 40 && SLUG.test(city) ? city : undefined,
    guests: guests && guests >= 1 && guests <= MAX_GUESTS ? guests : undefined,
    categories,
  };
}
