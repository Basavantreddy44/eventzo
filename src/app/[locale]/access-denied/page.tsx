import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/states/access-denied";
import { localeFrom } from "@/i18n/params";

/**
 * Where /admin and /vendor send signed-in users who lack the role. A real page
 * (reached by redirect) instead of a panel drawn by the portal layout, so the
 * server never answers 200 with the portal's title, and in-app navigation
 * away from it leaves nothing behind (QA B4, B5).
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/access-denied">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "errors" });
  return { title: t("accessDeniedTitle"), robots: { index: false } };
}

export default function AccessDeniedPage({ searchParams }: PageProps<"/[locale]/access-denied">) {
  // ?area= is request data, so it is read inside a boundary (Cache Components).
  return (
    <Suspense fallback={null}>
      <Denied searchParams={searchParams} />
    </Suspense>
  );
}

async function Denied({ searchParams }: Pick<PageProps<"/[locale]/access-denied">, "searchParams">) {
  const { area } = await searchParams;
  const t = await getTranslations();
  if (area === "vendor") {
    return (
      <AccessDenied
        description={t("errors.accessDeniedVendor")}
        action={{ href: "/become-a-vendor", label: t("home.vendorCtaButton") }}
      />
    );
  }
  return <AccessDenied description={t(area === "admin" ? "errors.accessDeniedAdmin" : "errors.accessDeniedGeneric")} />;
}
