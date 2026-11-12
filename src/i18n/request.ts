import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { routing } from "./routing";
import { mergeMessages } from "./merge-messages";
import en from "../../messages/en.json";

/**
 * Locale resolution, in order:
 *  1. an explicit locale (e.g. getTranslations({ locale }))
 *  2. the `[locale]` root param (works during prerendering — no headers read)
 *  3. next-intl's request locale (Server Actions / route handlers, where root
 *     params aren't available; set by the proxy)
 *
 * English is the source of truth: Kannada / Hindi files may be partial while
 * translations are in progress, and missing keys fall back to English.
 */
export default getRequestConfig(async ({ locale: explicit, requestLocale }) => {
  let requested: string | undefined = explicit;
  if (!requested) {
    try {
      requested = await rootLocale();
    } catch {
      requested = await requestLocale;
    }
  }
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const messages = locale === "en" ? en : mergeMessages(en, (await import(`../../messages/${locale}.json`)).default);

  return {
    locale,
    messages,
    timeZone: "Asia/Kolkata",
  };
});
