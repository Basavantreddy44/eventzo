import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarCheck, CloudOff, SearchX } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/states/empty-state";
import { localeFrom } from "@/i18n/params";
import { ListingCard } from "@/features/discovery/components/listing-card";
import { SearchPagination } from "@/features/discovery/components/pagination";
import { SearchBox } from "@/features/discovery/components/search-box";
import { SearchFilterPanel } from "@/features/discovery/components/search-filters";
import { getPreferredCitySlug } from "@/features/discovery/lib/city-preference";
import { parseSearchParams } from "@/features/discovery/lib/search-params";
import { searchListings } from "@/features/discovery/queries";
import { getActiveCities, getBusinessCategories, localizedName } from "@/features/taxonomy/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/search">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "search" });
  return { title: t("title") };
}

export default async function SearchPage({ searchParams }: PageProps<"/[locale]/search">) {
  const t = await getTranslations("search");
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<SearchSkeleton title={t("title")} />}>
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchResults({ searchParams }: { searchParams: PageProps<"/[locale]/search">["searchParams"] }) {
  const [t, locale, raw, preferredCity] = await Promise.all([
    getTranslations("search"),
    getLocale(),
    searchParams,
    getPreferredCitySlug(),
  ]);
  const parsed = parseSearchParams(raw);
  // An explicit ?city= wins; otherwise use the remembered city (no default, D7).
  const filters = { ...parsed, city: parsed.city ?? preferredCity ?? undefined };

  let categories: Awaited<ReturnType<typeof getBusinessCategories>>;
  let cities: Awaited<ReturnType<typeof getActiveCities>>;
  let result: Awaited<ReturnType<typeof searchListings>>;
  try {
    [categories, cities, result] = await Promise.all([
      getBusinessCategories(),
      getActiveCities(),
      searchListings(filters),
    ]);
  } catch (error) {
    console.error(error);
    return <EmptyState icon={CloudOff} title={t("title")} description={t("error")} />;
  }

  const city = cities.find((c) => c.slug === filters.city);
  const title = city ? t("titleIn", { city: localizedName(city, locale) }) : t("title");

  return (
    <>
      <div className="grid gap-4">
        <h1 className="font-display text-primary-strong text-3xl font-semibold">{title}</h1>
        <SearchBox
          defaultValue={filters.q}
          placeholder={t("placeholder")}
          submitLabel={t("submit")}
          hidden={{ city: parsed.city, category: filters.category, guests: filters.guests?.toString() }}
        />
        {!filters.city ? <p className="text-muted-foreground text-sm">{t("allCitiesHint")}</p> : null}
        <QuickStartNote raw={raw} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside>
          <Card className="lg:sticky lg:top-20">
            <CardContent>
              <h2 className="mb-4 font-semibold">{t("filters")}</h2>
              <SearchFilterPanel
                filters={{ ...filters, city: parsed.city }}
                categories={categories.map((c) => ({ slug: c.slug, label: localizedName(c, locale) }))}
              />
            </CardContent>
          </Card>
        </aside>

        <section aria-labelledby="results-heading" className="grid content-start gap-4">
          <h2 id="results-heading" className="text-muted-foreground text-sm font-medium" aria-live="polite">
            {t("results", { count: result.total })}
          </h2>
          {result.rows.length === 0 ? (
            <EmptyState icon={SearchX} title={t("emptyTitle")} description={t("emptyBody")} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="search-results">
              {result.rows.map((listing) => (
                <li key={listing.id}>
                  <ListingCard listing={listing} />
                </li>
              ))}
            </ul>
          )}
          <SearchPagination filters={filters} total={result.total} />
        </section>
      </div>
    </>
  );
}

/** Roadmap C1: after the home page's quick start, confirm the saved event or offer to save it. */
async function QuickStartNote({ raw }: { raw: Record<string, string | string[] | undefined> }) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const t = await getTranslations("home.quickStart");
  const eventId = one(raw.event);
  if (/^[0-9a-f-]{36}$/.test(eventId)) {
    await connection(); // the signed-in session (and its clock checks) is request-time
    const supabase = await createClient();
    const { data } = await supabase.from("events").select("id, title").eq("id", eventId).maybeSingle();
    if (!data) return null;
    return (
      <p
        className="bg-success/10 border-success/30 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
        role="status"
        data-testid="quick-start-note"
      >
        <CalendarCheck className="text-success size-4" aria-hidden />
        {t("saved", { title: data.title })}
        <Link href={`/account/events/${data.id}`} className="text-primary font-medium underline underline-offset-4">
          {t("openEvent")}
        </Link>
      </p>
    );
  }
  if (one(raw.start) === "1") {
    const next = `/account/events?type=${encodeURIComponent(one(raw.type))}&date=${encodeURIComponent(one(raw.date))}&guests=${encodeURIComponent(one(raw.guests))}`;
    return (
      <p
        className="bg-accent/50 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
        role="status"
        data-testid="quick-start-note"
      >
        {t("saveOffer")}
        <Link
          href={{ pathname: "/register", query: { next } }}
          className="text-primary font-medium underline underline-offset-4"
        >
          {t("saveOfferLink")}
        </Link>
      </p>
    );
  }
  return null;
}

function SearchSkeleton({ title }: { title: string }) {
  return (
    <div className="grid gap-6" aria-busy="true">
      <h1 className="font-display text-primary-strong text-3xl font-semibold">{title}</h1>
      <Skeleton className="h-10" />
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <Skeleton className="h-80" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      </div>
    </div>
  );
}
