import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Fraunces, Geist, Geist_Mono, Noto_Sans_Devanagari, Noto_Sans_Kannada } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { siteConfig } from "@/config/site";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import "../globals.css";
import { localeFrom } from "@/i18n/params";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", preload: false });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", weight: ["500", "600", "700"] });
// Script fonts are glyph fallbacks for Kannada / Hindi text; not preloaded on English pages.
const kannada = Noto_Sans_Kannada({ subsets: ["kannada"], variable: "--font-kannada", preload: false });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-devanagari", preload: false });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "metadata" });
  const tBrand = await getTranslations({ locale, namespace: "brand" });
  return {
    title: { default: `${siteConfig.name} · ${tBrand("tagline")}`, template: `%s · ${siteConfig.name}` },
    description: t("description"),
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, l === routing.defaultLocale ? "/" : `/${l}`])),
    },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = await localeFrom(params);
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html
      lang={locale}
      className={cn(geist.variable, geistMono.variable, fraunces.variable, kannada.variable, devanagari.variable)}
    >
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
