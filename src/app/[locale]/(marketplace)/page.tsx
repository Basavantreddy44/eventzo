import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Calculator, CloudOff, Store } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/states/empty-state";
import { CategoryIcon } from "@/features/taxonomy/components/category-icon";
import { getBusinessCategories, localizedName } from "@/features/taxonomy/queries";
import { localeFrom } from "@/i18n/params";
import { SearchBox } from "@/features/discovery/components/search-box";
import { UpcomingMuhurtham } from "@/features/muhurtham/components/upcoming-muhurtham";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = await localeFrom(params);
  const t = await getTranslations("home");

  return (
    <>
      <section className="from-accent/60 via-background to-background relative overflow-hidden border-b bg-gradient-to-b">
        <div
          aria-hidden
          className="bg-primary/10 pointer-events-none absolute -top-24 -right-24 size-80 rounded-full blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 md:py-24">
          <Badge variant="gold" className="px-3 py-1 text-xs">
            {t("heroEyebrow")}
          </Badge>
          <h1 className="font-display text-primary-strong max-w-3xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="text-muted-foreground max-w-2xl text-lg">{t("heroSubtitle")}</p>
          <div className="grid max-w-2xl gap-2">
            <p className="text-sm font-medium">{t("searchTitle")}</p>
            <SearchBox placeholder={t("searchPlaceholder")} submitLabel={t("searchSubmit")} size="lg" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/register">
                {t("heroPrimary")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/become-a-vendor">{t("heroSecondary")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <Suspense fallback={<CategoriesSkeleton />}>
        <Categories locale={locale} />
      </Suspense>

      <Suspense fallback={null}>
        <UpcomingMuhurtham />
      </Suspense>

      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="bg-card flex flex-col items-start gap-4 rounded-2xl border px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div className="flex items-start gap-4">
            <span className="bg-accent text-accent-foreground flex size-12 shrink-0 items-center justify-center rounded-xl">
              <Calculator className="size-6" aria-hidden />
            </span>
            <div className="grid gap-1">
              <h2 className="font-display text-primary-strong text-xl font-semibold">{t("estimatorCtaTitle")}</h2>
              <p className="text-muted-foreground">{t("estimatorCtaBody")}</p>
            </div>
          </div>
          <Button asChild size="lg">
            <Link href="/budget-estimator">{t("estimatorCtaButton")}</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="bg-primary text-primary-foreground flex flex-col items-start gap-4 rounded-2xl px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div className="grid max-w-xl gap-2">
            <h2 className="font-display text-2xl font-semibold">{t("vendorCtaTitle")}</h2>
            <p className="text-primary-foreground/80">{t("vendorCtaBody")}</p>
          </div>
          <Button asChild size="lg" variant="gold">
            <Link href="/become-a-vendor">
              <Store aria-hidden />
              {t("vendorCtaButton")}
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}

async function Categories({ locale }: { locale: string }) {
  await connection(); // fetched at request time (then cached), never at build time
  const t = await getTranslations("home");
  let categories: Awaited<ReturnType<typeof getBusinessCategories>>;
  try {
    categories = await getBusinessCategories();
  } catch (error) {
    // Keep the rest of the home page usable if the database is unreachable.
    // Failures are not cached, so the next request retries.
    console.error(error);
    return (
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <EmptyState icon={CloudOff} title={t("allCategoriesTitle")} description={t("categoriesError")} />
      </section>
    );
  }
  const launch = categories.filter((c) => c.is_launch_focus);
  const rest = categories.filter((c) => !c.is_launch_focus);

  if (categories.length === 0) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <EmptyState title={t("allCategoriesTitle")} description={t("categoriesEmpty")} />
      </section>
    );
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6">
      <div className="grid gap-6">
        <div className="grid gap-1">
          <h2 className="font-display text-primary-strong text-2xl font-semibold">{t("launchCategoriesTitle")}</h2>
          <p className="text-muted-foreground">{t("launchCategoriesSubtitle")}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3">
          {launch.map((category) => (
            <li key={category.id}>
              <Card className="hover:border-primary/40 relative h-full transition-colors hover:shadow-md">
                <CardHeader>
                  <span className="bg-accent text-accent-foreground mb-2 flex size-11 items-center justify-center rounded-lg">
                    <CategoryIcon name={category.icon} className="size-5" />
                  </span>
                  <CardTitle className="text-lg">
                    <Link
                      href={{ pathname: "/search", query: { category: category.slug } }}
                      className="after:absolute after:inset-0 focus-visible:outline-none"
                    >
                      {localizedName(category, locale)}
                    </Link>
                  </CardTitle>
                  {category.description ? <CardDescription>{category.description}</CardDescription> : null}
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      {rest.length > 0 ? (
        <div className="grid gap-4">
          <h2 className="font-display text-primary-strong text-xl font-semibold">{t("allCategoriesTitle")}</h2>
          <Card>
            <CardContent>
              <ul className="flex flex-wrap gap-2">
                {rest.map((category) => (
                  <li key={category.id}>
                    <Link
                      href={{ pathname: "/search", query: { category: category.slug } }}
                      className="bg-background hover:border-primary/40 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors"
                    >
                      <CategoryIcon name={category.icon} className="text-gold size-4" />
                      {localizedName(category, locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  );
}

function CategoriesSkeleton() {
  return (
    <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6" aria-busy="true">
      <Skeleton className="h-7 w-64" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </section>
  );
}
