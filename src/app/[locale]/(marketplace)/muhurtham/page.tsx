import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, CloudOff } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/states/empty-state";
import { intlLocale } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { getPreferredCitySlug } from "@/features/discovery/lib/city-preference";
import { MonthCalendar } from "@/features/muhurtham/components/month-calendar";
import { addMonths, formatMonthParam, monthRange, parseMonth, todayIn } from "@/features/muhurtham/lib/calendar";
import { forCity, getAuspiciousDates, significanceKey } from "@/features/muhurtham/queries";
import { getActiveCities, localizedName } from "@/features/taxonomy/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/muhurtham">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "muhurtham" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function MuhurthamPage({ searchParams }: PageProps<"/[locale]/muhurtham">) {
  const t = await getTranslations("muhurtham");
  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:px-6">
      <header className="grid gap-2">
        <h1 className="font-display text-primary-strong text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <Suspense fallback={<Skeleton className="h-[28rem]" />}>
        <CalendarSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CalendarSection({ searchParams }: { searchParams: PageProps<"/[locale]/muhurtham">["searchParams"] }) {
  const [t, locale, raw, preferred] = await Promise.all([
    getTranslations("muhurtham"),
    getLocale(),
    searchParams,
    getPreferredCitySlug(),
  ]);
  await connection(); // "today" is request-time
  const today = todayIn("Asia/Kolkata");
  const month = parseMonth(typeof raw.month === "string" ? raw.month : undefined, today);
  const cityParam = typeof raw.city === "string" ? raw.city : undefined;
  const { from, to } = monthRange(month);

  let cities: Awaited<ReturnType<typeof getActiveCities>>;
  let all: Awaited<ReturnType<typeof getAuspiciousDates>>;
  try {
    [cities, all] = await Promise.all([getActiveCities(), getAuspiciousDates(from, to)]);
  } catch (error) {
    console.error(error);
    return <EmptyState icon={CloudOff} title={t("title")} description={t("error")} />;
  }

  const city = cities.find((c) => c.slug === (cityParam ?? preferred));
  const dates = forCity(all, city?.id ?? null);
  const cityName = new Map(cities.map((c) => [c.id, localizedName(c, locale)]));
  const monthLabel = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(month.year, month.month - 1, 1)));
  const fullDate = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "full", timeZone: "UTC" });
  const nav = (delta: number) => ({
    pathname: "/muhurtham",
    query: { month: formatMonthParam(addMonths(month, delta)), ...(cityParam ? { city: cityParam } : {}) },
  });

  return (
    <div className="grid gap-6">
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-2">
            <Button asChild variant="ghost" size="icon" aria-label={t("previous")}>
              <Link href={nav(-1)}>
                <ChevronLeft aria-hidden />
              </Link>
            </Button>
            <div className="text-center">
              <h2 className="text-lg font-semibold" aria-live="polite">
                {monthLabel}
              </h2>
              <p className="text-muted-foreground text-xs">
                {city ? t("forCity", { city: localizedName(city, locale) }) : t("forAllCities")}
              </p>
            </div>
            <Button asChild variant="ghost" size="icon" aria-label={t("next")}>
              <Link href={nav(1)}>
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          </div>
          <MonthCalendar month={month} dates={dates} today={today} />
        </CardContent>
      </Card>

      <section className="grid gap-3" aria-labelledby="dates-heading">
        <h2 id="dates-heading" className="text-lg font-semibold">
          {t("listTitle")}
        </h2>
        {dates.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("emptyMonth")}</p>
        ) : (
          <ul className="grid gap-2">
            {dates.map((d) => {
              const key = significanceKey(d.significance);
              return (
                <li
                  key={d.id}
                  className="bg-card flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4"
                >
                  <div className="grid gap-1">
                    <p className="font-medium">{fullDate.format(new Date(`${d.date}T00:00:00Z`))}</p>
                    <p className="text-muted-foreground text-sm">
                      {localizedName({ name: d.title, name_i18n: d.title_i18n }, locale)}
                    </p>
                    {d.windows.length > 0 ? (
                      <p className="text-sm">
                        <span className="text-muted-foreground">{t("windows")}: </span>
                        {d.windows.map((w) => `${w.start}–${w.end}`).join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {d.city_id ? (
                      <Badge variant="outline">{t("cityOnly", { city: cityName.get(d.city_id) ?? "" })}</Badge>
                    ) : null}
                    <Badge variant={key === "high" ? "default" : "gold"}>{t(`significance.${key}`)}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-muted-foreground text-xs">{t("disclaimer")}</p>
      </section>
    </div>
  );
}
