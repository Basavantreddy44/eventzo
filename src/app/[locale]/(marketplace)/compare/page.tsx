import { Suspense } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BadgeCheck, Heart } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { getPublicEnv } from "@/lib/env";
import { formatPaise } from "@/lib/money";
import { intlLocale } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { ListingCover } from "@/features/discovery/components/listing-cover";
import { formatListingPrice, type PriceTranslator } from "@/features/discovery/lib/price";
import { getListing } from "@/features/discovery/queries";
import { ShortlistButton } from "@/features/shortlist/components/shortlist-button";
import { ShareCompare } from "@/features/shortlist/components/share-compare";
import { SHORTLIST_MAX, SHORTLIST_SLUG } from "@/features/shortlist/lib/constants";
import type { ListingDetail } from "@/types/database";

export async function generateMetadata({ params }: PageProps<"/[locale]/compare">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "shortlist" });
  return { title: t("compareTitle"), robots: { index: false } };
}

/** Side-by-side comparison of up to 4 listings (Roadmap C4). Public, so a shared link works without signing in. */
export default function ComparePage({ searchParams }: PageProps<"/[locale]/compare">) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Comparison searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function parseSlugs(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return [...new Set((value ?? "").split(",").map((s) => s.trim().toLowerCase()))]
    .filter((s) => SHORTLIST_SLUG.test(s))
    .slice(0, SHORTLIST_MAX);
}

async function Comparison({ searchParams }: Pick<PageProps<"/[locale]/compare">, "searchParams">) {
  const slugs = parseSlugs((await searchParams).l);
  const [t, tListing, tPriceRaw, locale] = await Promise.all([
    getTranslations("shortlist"),
    getTranslations("listing"),
    getTranslations("listing.price"),
    getLocale(),
  ]);
  const tPrice = tPriceRaw as unknown as PriceTranslator;
  const listings = (await Promise.all(slugs.map((s) => getListing(s).catch(() => null)))).filter(
    (l): l is ListingDetail => !!l,
  );

  if (listings.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title={t("emptyTitle")}
        description={t("emptyBody")}
        action={
          <Button asChild>
            <Link href="/search">{t("browse")}</Link>
          </Button>
        }
      />
    );
  }

  const site = getPublicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const shareUrl = `${site}${prefix}/compare?l=${listings.map((l) => l.slug).join(",")}`;
  const money = (paise: number | null | undefined) =>
    paise == null ? null : formatPaise(BigInt(paise), { locale: intlLocale(locale) });
  const without = (slug: string) => listings.map((l) => l.slug).filter((s) => s !== slug);

  const rows: { label: string; value: (l: ListingDetail) => React.ReactNode }[] = [
    { label: t("rows.price"), value: (l) => formatListingPrice(l, tPrice, locale) },
    { label: t("rows.category"), value: (l) => l.category.name },
    {
      label: t("rows.location"),
      value: (l) => [l.location.area, l.location.city].filter(Boolean).join(", "),
    },
    {
      label: t("rows.guests"),
      value: (l) =>
        l.min_guests || l.max_guests
          ? t("guestsRange", { min: l.min_guests ?? 0, max: l.max_guests ?? l.min_guests ?? 0 })
          : null,
    },
    { label: t("rows.seated"), value: (l) => l.venue?.seated_capacity ?? null },
    { label: t("rows.floating"), value: (l) => l.venue?.floating_capacity ?? null },
    {
      label: t("rows.ac"),
      value: (l) => (l.venue?.air_conditioned == null ? null : l.venue.air_conditioned ? t("yes") : t("no")),
    },
    { label: t("rows.parking"), value: (l) => l.venue?.parking_cars ?? null },
    { label: t("rows.vegPlate"), value: (l) => money(l.catering?.veg_price_per_plate_paise) },
    { label: t("rows.nonvegPlate"), value: (l) => money(l.catering?.nonveg_price_per_plate_paise) },
    { label: t("rows.booking"), value: (l) => tListing(`bookingMode.${l.booking_mode}`) },
    {
      label: t("rows.verified"),
      value: (l) =>
        l.vendor.verified ? (
          <Badge variant="success">
            <BadgeCheck aria-hidden />
            {tListing("verified")}
          </Badge>
        ) : (
          t("no")
        ),
    },
  ];
  // Hide rows where nothing compared has a value.
  const shown = rows.filter((r) => listings.some((l) => r.value(l) != null && r.value(l) !== ""));

  return (
    <>
      <PageHeader
        title={t("compareTitle")}
        description={t("compareSubtitle", { count: listings.length })}
        actions={<ShareCompare url={shareUrl} titles={listings.map((l) => l.title)} />}
      />
      {listings.length < 2 ? <p className="text-muted-foreground text-sm">{t("addOneMore")}</p> : null}
      <div className="overflow-x-auto rounded-xl border" data-testid="compare-table">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="bg-muted/40 w-40 p-3 text-left align-bottom font-medium">
                <span className="sr-only">{t("rows.feature")}</span>
              </th>
              {listings.map((l) => (
                <th key={l.slug} scope="col" className="p-3 text-left align-top font-normal">
                  <div className="grid gap-2">
                    <div className="relative">
                      <ListingCover
                        path={l.media[0]?.path ?? null}
                        alt={l.media[0]?.alt ?? l.title}
                        icon={l.category.icon}
                        className="rounded-lg"
                        sizes="25vw"
                        placeholderLabel={l.category.name}
                      />
                      <ShortlistButton slug={l.slug} title={l.title} className="absolute top-2 right-2" />
                    </div>
                    <Link
                      href={`/listings/${l.slug}`}
                      className="text-primary font-semibold underline-offset-4 hover:underline"
                    >
                      {l.title}
                    </Link>
                    <span className="text-muted-foreground text-xs">{l.vendor.name}</span>
                    {listings.length > 1 ? (
                      <Link
                        href={{ pathname: "/compare", query: { l: without(l.slug).join(",") } }}
                        className="text-muted-foreground text-xs underline underline-offset-4"
                      >
                        {t("removeFromCompare")}
                      </Link>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.label} className="border-t">
                <th scope="row" className="bg-muted/40 p-3 text-left font-medium">
                  {r.label}
                </th>
                {listings.map((l) => (
                  <td key={l.slug} className="p-3 align-top">
                    {r.value(l) ?? <span className="text-muted-foreground">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">{t("compareNote")}</p>
    </>
  );
}
