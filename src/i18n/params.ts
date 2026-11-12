import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing, type AppLocale } from "./routing";

/** Reads `[locale]` from route params, narrowing it to a supported locale (404 otherwise). */
export async function localeFrom(params: Promise<{ locale: string }>): Promise<AppLocale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return locale;
}
