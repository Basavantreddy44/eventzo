import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import { getLocale, getTranslations } from "next-intl/server";
import { Calculator, CloudOff } from "lucide-react";
import { getPathname, Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/states/empty-state";
import { formatPaise } from "@/lib/money";
import { intlLocale } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { getPreferredCitySlug } from "@/features/discovery/lib/city-preference";
import { estimateBudget, MAX_GUESTS } from "@/features/budget/lib/estimate";
import { parseEstimatorParams } from "@/features/budget/lib/params";
import { getPublishedBenchmarks } from "@/features/budget/queries";
import { CategoryIcon } from "@/features/taxonomy/components/category-icon";
import { getActiveCities, getBusinessCategories, localizedName } from "@/features/taxonomy/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/budget-estimator">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "estimator" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function BudgetEstimatorPage({ searchParams }: PageProps<"/[locale]/budget-estimator">) {
  const t = await getTranslations("estimator");
  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:px-6">
      <header className="grid gap-2">
        <h1 className="font-display text-primary-strong flex items-center gap-2 text-3xl font-semibold">
          <Calculator className="text-gold size-7" aria-hidden />
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Estimator searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Estimator({ searchParams }: { searchParams: PageProps<"/[locale]/budget-estimator">["searchParams"] }) {
  const [t, locale, raw, preferred] = await Promise.all([
    getTranslations("estimator"),
    getLocale(),
    searchParams,
    getPreferredCitySlug(),
  ]);
  const input = parseEstimatorParams(raw);
  const citySlug = input.city ?? preferred ?? undefined;

  let cities: Awaited<ReturnType<typeof getActiveCities>>;
  let categories: Awaited<ReturnType<typeof getBusinessCategories>>;
  let benchmarks: Awaited<ReturnType<typeof getPublishedBenchmarks>>;
  try {
    [cities, categories, benchmarks] = await Promise.all([
      getActiveCities(),
      getBusinessCategories(),
      getPublishedBenchmarks(),
    ]);
  } catch (error) {
    console.error(error);
    return <EmptyState icon={CloudOff} title={t("title")} description={t("error")} />;
  }

  const city = cities.find((c) => c.slug === citySlug);
  const cityBenchmarks = benchmarks.filter((b) => b.citySlug === city?.slug);
  // Offer the categories that have a range in at least one city.
  const offered = categories.filter((c) => benchmarks.some((b) => b.categorySlug === c.slug));
  const categoryName = new Map(categories.map((c) => [c.slug, localizedName(c, locale)]));
  const categoryIcon = new Map(categories.map((c) => [c.slug, c.icon]));
  const money = (paise: number) => formatPaise(BigInt(paise), { locale: intlLocale(locale) });
  const action = getPathname({ href: "/budget-estimator", locale });
  const ready = city && input.guests && input.categories.length > 0;
  const estimate = ready
    ? estimateBudget({ guests: input.guests!, categories: input.categories, benchmarks: cityBenchmarks })
    : null;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardContent>
          <Form action={action} className="grid gap-5" aria-label={t("title")}>
            <div className="grid gap-2">
              <Label htmlFor="est-city">{t("city")}</Label>
              <NativeSelect id="est-city" name="city" defaultValue={city?.slug ?? ""} required>
                <option value="" disabled>
                  {t("chooseCity")}
                </option>
                {cities.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {localizedName(c, locale)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="est-guests">{t("guests")}</Label>
              <Input
                id="est-guests"
                name="guests"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_GUESTS}
                required
                defaultValue={input.guests ?? 300}
              />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t("categories")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {offered.map((c) => (
                  <label
                    key={c.slug}
                    className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="c"
                      value={c.slug}
                      defaultChecked={input.categories.length ? input.categories.includes(c.slug) : c.is_launch_focus}
                      className="accent-primary size-4"
                    />
                    <CategoryIcon name={c.icon} className="text-gold size-4" />
                    {localizedName(c, locale)}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" size="lg">
              {t("submit")}
            </Button>
          </Form>
        </CardContent>
      </Card>

      <Card className="content-start" aria-live="polite">
        <CardHeader>
          <CardTitle>{t("resultTitle")}</CardTitle>
          {city ? <CardDescription>{localizedName(city, locale)}</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          {!estimate ? (
            <p className="text-muted-foreground text-sm">
              {city && input.guests ? t("pickCategories") : t("pickCity")}
            </p>
          ) : cityBenchmarks.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noData", { city: localizedName(city!, locale) })}</p>
          ) : (
            <>
              <p className="font-display text-primary-strong text-3xl font-semibold" data-testid="estimate-total">
                {money(estimate.totalLowPaise)} – {money(estimate.totalHighPaise)}
              </p>
              <ul className="grid gap-3">
                {estimate.lines
                  .filter((l) => l.available)
                  .map((l) => {
                    const b = cityBenchmarks.find((x) => x.categorySlug === l.categorySlug)!;
                    return (
                      <li
                        key={l.categorySlug}
                        className="flex items-start justify-between gap-3 border-b pb-3 text-sm last:border-0"
                      >
                        <div className="grid gap-0.5">
                          <span className="flex items-center gap-2 font-medium">
                            <CategoryIcon
                              name={categoryIcon.get(l.categorySlug) ?? null}
                              className="text-gold size-4"
                            />
                            {categoryName.get(l.categorySlug)}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {l.unit === "per_guest"
                              ? t("perGuestLine", {
                                  low: money(b.lowPaise),
                                  high: money(b.highPaise),
                                  guests: input.guests!,
                                })
                              : t("perEventLine")}
                          </span>
                          <Link
                            href={{
                              pathname: "/search",
                              query: { category: l.categorySlug, city: city!.slug, guests: input.guests },
                            }}
                            className="text-primary text-xs underline-offset-4 hover:underline"
                          >
                            {t("findVendors", { category: categoryName.get(l.categorySlug) ?? "" })}
                          </Link>
                        </div>
                        <span className="text-right font-medium whitespace-nowrap tabular-nums">
                          {money(l.lowPaise)} – {money(l.highPaise)}
                        </span>
                      </li>
                    );
                  })}
              </ul>
              {estimate.missing.length > 0 ? (
                <p className="text-muted-foreground text-xs">
                  {t("missing", { list: estimate.missing.map((s) => categoryName.get(s) ?? s).join(", ") })}
                </p>
              ) : null}
            </>
          )}
          <p className="text-muted-foreground bg-muted rounded-md p-3 text-xs">{t("disclaimer")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
