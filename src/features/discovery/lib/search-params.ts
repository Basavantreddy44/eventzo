import { rupeesToPaise } from "@/lib/money";

/** Discovery URL contract: /search?q=&city=&category=&service=&guests=&max=&sort=&page= */
export const SORTS = ["recommended", "relevance", "price_asc", "price_desc", "capacity"] as const;
export type SearchSort = (typeof SORTS)[number];

export const PAGE_SIZE = 12;
export const MAX_PAGE = 100;

export type SearchFilters = {
  q?: string;
  city?: string;
  category?: string;
  service?: string;
  guests?: number;
  /** Upper bound on the listing's base price, in paise. */
  maxPricePaise?: number;
  sort: SearchSort;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed : undefined;
}

function slug(value: string | string[] | undefined): string | undefined {
  const v = first(value)?.toLowerCase();
  return v && v.length <= 80 && SLUG.test(v) ? v : undefined;
}

function positiveInt(value: string | string[] | undefined, max: number): number | undefined {
  const v = first(value);
  if (!v || !/^\d{1,9}$/.test(v)) return undefined;
  const n = Number(v);
  return n >= 1 && n <= max ? n : undefined;
}

/**
 * Parses untrusted URL params into safe filters. Invalid values are dropped
 * (never thrown), so a hand-edited URL still renders a sensible page.
 */
export function parseSearchParams(raw: RawParams): SearchFilters {
  const q = first(raw.q)?.slice(0, 100);
  const maxRupees = first(raw.max);
  const maxPaise = maxRupees ? rupeesToPaise(maxRupees) : null;
  const sortRaw = first(raw.sort) as SearchSort | undefined;
  const sort: SearchSort =
    sortRaw && (SORTS as readonly string[]).includes(sortRaw) ? sortRaw : q ? "relevance" : "recommended";

  return {
    q,
    city: slug(raw.city),
    category: slug(raw.category),
    service: slug(raw.service),
    guests: positiveInt(raw.guests, 100_000),
    maxPricePaise: maxPaise !== null && maxPaise > 0n && maxPaise <= 100_000_000_000n ? Number(maxPaise) : undefined,
    sort,
    page: positiveInt(raw.page, MAX_PAGE) ?? 1,
  };
}

/** Serialises filters back into URL params (omitting defaults), for links. */
export function toSearchQuery(filters: Partial<SearchFilters>): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.q) out.q = filters.q;
  if (filters.city) out.city = filters.city;
  if (filters.category) out.category = filters.category;
  if (filters.service) out.service = filters.service;
  if (filters.guests) out.guests = String(filters.guests);
  if (filters.maxPricePaise) out.max = String(Math.floor(filters.maxPricePaise / 100));
  if (filters.sort && filters.sort !== (filters.q ? "relevance" : "recommended")) out.sort = filters.sort;
  if (filters.page && filters.page > 1) out.page = String(filters.page);
  return out;
}
