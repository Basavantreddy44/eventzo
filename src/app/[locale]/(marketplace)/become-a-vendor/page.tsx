import { Suspense } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Briefcase } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/states/loading-state";
import { getCurrentUser } from "@/lib/auth/session";
import { vendorMemberships } from "@/lib/auth/permissions";
import { OnboardingForm } from "@/features/organizations/components/onboarding-form";
import { getActiveCities, getBusinessCategories, localizedName } from "@/features/taxonomy/queries";
import { localeFrom } from "@/i18n/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/become-a-vendor">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "vendor.onboarding" });
  return { title: t("title") };
}

export default async function BecomeVendorPage() {
  const t = await getTranslations("vendor.onboarding");
  const tCommon = await getTranslations("common");

  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <div className="grid gap-2">
        <h1 className="font-display text-primary-strong text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Suspense fallback={<LoadingState label={tCommon("loading")} cards={1} />}>
        <OnboardingSection />
      </Suspense>
    </div>
  );
}

async function OnboardingSection() {
  const t = await getTranslations();
  const locale = await getLocale();
  const user = await getCurrentUser();

  if (!user) {
    const next = locale === "en" ? "/become-a-vendor" : `/${locale}/become-a-vendor`;
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("vendor.onboarding.title")}</CardTitle>
          <CardDescription>{t("vendor.onboarding.loginRequired")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={{ pathname: "/register", query: { next } }}>{t("nav.register")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={{ pathname: "/login", query: { next } }}>{t("nav.login")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const [categories, cities] = await Promise.all([getBusinessCategories(), getActiveCities()]);
  const existing = vendorMemberships(user.access);

  return (
    <div className="grid gap-4">
      {existing.length > 0 ? (
        <Card className="border-gold/40 bg-accent/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="size-4" aria-hidden />
              {t("vendor.onboarding.existingTitle")}
            </CardTitle>
            <CardDescription>{t("vendor.onboarding.existingBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/vendor">{t("nav.vendor")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardContent>
          <OnboardingForm
            categories={categories.map((c) => ({ id: c.id, label: localizedName(c, locale) }))}
            cities={cities.map((c) => ({ id: c.id, label: `${localizedName(c, locale)}, ${c.state}` }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
