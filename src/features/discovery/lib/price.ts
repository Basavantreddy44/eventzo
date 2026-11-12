import { formatPaise } from "@/lib/money";
import { intlLocale } from "@/lib/datetime";
import type { PriceType, PriceUnit } from "@/types/database";

export type PriceInput = {
  price_type: PriceType;
  price_unit: PriceUnit | null;
  base_price_paise: number | null;
  max_price_paise: number | null;
  currency?: string | null;
};

/** Minimal translator shape (next-intl's `t` scoped to `listing.price`). */
export type PriceTranslator = (key: string, values?: Record<string, string>) => string;

/**
 * "From ₹1,50,000 / day", "₹3,00,000 – ₹6,00,000 / day", "Price on request".
 * Keys used: onRequest, fixed, from, range, unit.<price_unit>
 */
export function formatListingPrice(input: PriceInput, t: PriceTranslator, locale = "en"): string {
  if (input.price_type === "on_request" || input.base_price_paise === null) return t("onRequest");

  const fmt = (paise: number) =>
    formatPaise(BigInt(paise), { currency: input.currency ?? "INR", locale: intlLocale(locale) });
  const amount = fmt(input.base_price_paise);

  let core: string;
  if (input.price_type === "range" && input.max_price_paise !== null) {
    core = t("range", { min: amount, max: fmt(input.max_price_paise) });
  } else if (input.price_type === "starting_from") {
    core = t("from", { amount });
  } else {
    core = t("fixed", { amount });
  }

  return input.price_unit ? `${core} ${t(`unit.${input.price_unit}`)}` : core;
}
