import { defineRouting } from "next-intl/routing";

/**
 * Locale-prefixed routing (approved 10 Nov 2026):
 *   English (default) → no prefix:  /, /vendor, /admin
 *   Kannada / Hindi   → prefixed:   /kn/..., /hi/...
 * Keep in sync with the `public.app_locale` enum in the database.
 */
export const routing = defineRouting({
  locales: ["en", "kn", "hi"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];

/** Shown next to the language icon so the switch is easy to spot (Roadmap C12). */
export const localeShort: Record<AppLocale, string> = { en: "EN", kn: "ಕ", hi: "हि" };

export const localeLabels: Record<AppLocale, string> = {
  en: "English",
  kn: "ಕನ್ನಡ",
  hi: "हिन्दी",
};
