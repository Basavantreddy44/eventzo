import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, BadgeCheck, CalendarHeart, MapPin, MessageSquare, Zap } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPaise } from "@/lib/money";
import { formatDateTime, intlLocale } from "@/lib/datetime";
import { ListingCover } from "@/features/discovery/components/listing-cover";
import { formatListingPrice, type PriceTranslator } from "@/features/discovery/lib/price";
import { getListing } from "@/features/discovery/queries";
import { forCity, getAuspiciousDates, significanceKey } from "@/features/muhurtham/queries";
import { todayIn } from "@/features/muhurtham/lib/calendar";
import { getActiveCities } from "@/features/taxonomy/queries";
import type { ListingDetail } from "@/types/database";
import { getCurrentUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/auth/portal-user";
import { EnquiryPanel } from "@/features/enquiries/components/enquiry-panel";

type Props = PageProps<"/[locale]/listings/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListing(slug).catch(() => null);
  if (!listing) return { title: "404", robots: { index: false } };
  return {
    title: listing.title,
    description: listing.summary ?? undefined,
  };
}

export default function ListingPage({ params }: Props) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Suspense fallback={<ListingSkeleton />}>
        <ListingContent params={params} />
      </Suspense>
    </div>
  );
}

async function ListingContent({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  const listing = await getListing(slug);
  if (!listing) notFound();

  const [t, tPriceRaw, locale] = await Promise.all([
    getTranslations("listing"),
    getTranslations("listing.price"),
    getLocale(),
  ]);
  const tPrice = tPriceRaw as unknown as PriceTranslator;
  const money = (paise: number) =>
    formatPaise(BigInt(paise), { currency: listing.currency, locale: intlLocale(locale) });
  const place = [listing.location.area, listing.location.city, listing.location.state].filter(Boolean).join(", ");
  const [cover, ...gallery] = listing.media;

  return (
    <article className="grid gap-8">
      <Link
        href={{
          pathname: "/search",
          query: { category: listing.category.business_slug, city: listing.location.city_slug },
        }}
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("backToSearch")}
      </Link>

      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{listing.category.name}</Badge>
          {listing.vendor.verified ? (
            <Badge variant="success">
              <BadgeCheck aria-hidden />
              {t("verified")}
            </Badge>
          ) : null}
          <Badge variant="outline">
            {listing.booking_mode === "instant" ? <Zap aria-hidden /> : <MessageSquare aria-hidden />}
            {t(`bookingMode.${listing.booking_mode}`)}
          </Badge>
        </div>
        <h1 className="font-display text-primary-strong text-3xl font-semibold sm:text-4xl">{listing.title}</h1>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>{listing.vendor.name}</span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-4" aria-hidden />
            {place}
          </span>
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-8">
          <section aria-label={listing.title} className="grid gap-2">
            <ListingCover
              path={cover?.path ?? null}
              alt={cover?.alt ?? t("photoAlt", { title: listing.title, n: 1 })}
              icon={listing.category.icon}
              className="rounded-xl"
              sizes="(min-width: 1024px) 60vw, 100vw"
              priority
              placeholderLabel={t("noPhotos")}
            />
            {gallery.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {gallery.map((m, i) => (
                  <li key={m.path}>
                    <ListingCover
                      path={m.path}
                      alt={m.alt ?? t("photoAlt", { title: listing.title, n: i + 2 })}
                      icon={listing.category.icon}
                      className="rounded-lg"
                      sizes="25vw"
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {listing.description || listing.summary ? (
            <section className="grid gap-2">
              <h2 className="text-xl font-semibold">{t("about")}</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {listing.description ?? listing.summary}
              </p>
            </section>
          ) : null}

          {listing.venue ? <VenueDetails venue={listing.venue} t={t} /> : null}
          {listing.catering ? <CateringDetails catering={listing.catering} t={t} money={money} /> : null}

          <section className="grid gap-2">
            <h2 className="text-xl font-semibold">{t("aboutVendor")}</h2>
            <p className="font-medium">{listing.vendor.name}</p>
            {listing.vendor.tagline ? <p className="text-muted-foreground">{listing.vendor.tagline}</p> : null}
            {listing.vendor.about ? (
              <p className="text-muted-foreground leading-relaxed">{listing.vendor.about}</p>
            ) : null}
            <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {listing.vendor.year_established ? (
                <div>{t("established", { year: listing.vendor.year_established })}</div>
              ) : null}
              {listing.vendor.languages.length > 0 ? (
                <div>
                  <dt className="inline">{t("languages")}: </dt>
                  <dd className="inline">{listing.vendor.languages.map((l) => t(`languageNames.${l}`)).join(", ")}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>

        <aside className="grid content-start gap-4">
          <Card className="lg:sticky lg:top-20">
            <CardHeader>
              <p className="text-muted-foreground text-sm">{t("priceLabel")}</p>
              <CardTitle className="text-primary-strong text-xl">
                {formatListingPrice(listing, tPrice, locale)}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <GuestRange listing={listing} t={t} />
              <EnquirySection
                serviceId={listing.id}
                instant={listing.booking_mode === "instant"}
                maxGuests={listing.max_guests}
                timeZone={listing.location.timezone}
                locale={locale}
                slug={listing.slug}
              />
            </CardContent>
          </Card>
          <Suspense fallback={<Skeleton className="h-40" />}>
            <ListingMuhurtham citySlug={listing.location.city_slug} timeZone={listing.location.timezone} />
          </Suspense>
        </aside>
      </div>
    </article>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"listing">>>;

function GuestRange({ listing, t }: { listing: ListingDetail; t: T }) {
  const { min_guests: min, max_guests: max } = listing;
  if (!min && !max) return null;
  const text =
    min && max ? t("guestsRange", { min, max }) : max ? t("guestsUpTo", { max }) : t("guestsFrom", { min: min! });
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{t("guestsLabel")}: </span>
      {text}
    </p>
  );
}

function Facts({ items }: { items: { label: string; value: string | null }[] }) {
  const visible = items.filter((i) => i.value !== null);
  if (visible.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {visible.map((i) => (
        <div key={i.label} className="grid gap-0.5">
          <dt className="text-muted-foreground text-xs">{i.label}</dt>
          <dd className="font-medium">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function VenueDetails({ venue, t }: { venue: NonNullable<ListingDetail["venue"]>; t: T }) {
  const num = (n: number | null) => (n === null ? null : n.toLocaleString("en-IN"));
  const bool = (b: boolean | null) => (b === null ? null : b ? t("yes") : t("no"));
  const policy = (p: string | null) => (p ? t(`policy.${p as "both"}`) : null);
  return (
    <section className="grid gap-3">
      <h2 className="text-xl font-semibold">{t("venueTitle")}</h2>
      <Facts
        items={[
          { label: t("seated"), value: num(venue.seated_capacity) },
          { label: t("floating"), value: num(venue.floating_capacity) },
          { label: t("dining"), value: num(venue.dining_capacity) },
          { label: t("rooms"), value: num(venue.rooms) },
          { label: t("parking"), value: num(venue.parking_cars) },
          { label: t("areaSqft"), value: num(venue.area_sqft) },
          { label: t("airConditioned"), value: bool(venue.air_conditioned) },
          { label: t("cateringPolicy"), value: policy(venue.catering_policy) },
          { label: t("decorPolicy"), value: policy(venue.decor_policy) },
          { label: t("alcohol"), value: bool(venue.alcohol_allowed) },
        ]}
      />
    </section>
  );
}

function CateringDetails({
  catering,
  t,
  money,
}: {
  catering: NonNullable<ListingDetail["catering"]>;
  t: T;
  money: (paise: number) => string;
}) {
  const bool = (b: boolean | null) => (b === null ? null : b ? t("yes") : t("no"));
  const plates =
    catering.min_plates && catering.max_plates
      ? t("guestsRange", { min: catering.min_plates, max: catering.max_plates })
      : null;
  return (
    <section className="grid gap-3">
      <h2 className="text-xl font-semibold">{t("cateringTitle")}</h2>
      <Facts
        items={[
          {
            label: t("vegPlate"),
            value: catering.veg_price_per_plate_paise === null ? null : money(catering.veg_price_per_plate_paise),
          },
          {
            label: t("nonvegPlate"),
            value: catering.nonveg_price_per_plate_paise === null ? null : money(catering.nonveg_price_per_plate_paise),
          },
          { label: t("cuisines"), value: catering.cuisines.length ? catering.cuisines.join(", ") : null },
          { label: t("plates"), value: plates },
          { label: t("liveCounters"), value: bool(catering.live_counters) },
          { label: t("staffIncluded"), value: bool(catering.service_staff_included) },
        ]}
      />
    </section>
  );
}

async function ListingMuhurtham({ citySlug, timeZone }: { citySlug: string; timeZone: string }) {
  const [t, locale] = await Promise.all([getTranslations("muhurtham"), getLocale()]);
  await connection(); // "today" is request-time
  const today = todayIn(timeZone);
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 120);

  let dates: Awaited<ReturnType<typeof getAuspiciousDates>> = [];
  let cityId: string | null = null;
  try {
    const [all, cities] = await Promise.all([
      getAuspiciousDates(today, horizon.toISOString().slice(0, 10)),
      getActiveCities(),
    ]);
    cityId = cities.find((c) => c.slug === citySlug)?.id ?? null;
    dates = forCity(all, cityId).slice(0, 4);
  } catch (error) {
    console.error(error);
    return null;
  }
  if (dates.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarHeart className="text-gold size-4" aria-hidden />
          {t("upcomingTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="grid gap-2 text-sm">
          {dates.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2">
              <span>
                {formatDateTime(`${d.date}T12:00:00Z`, locale, "UTC", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <Badge variant={d.significance >= 3 ? "default" : "gold"}>
                {t(`significance.${significanceKey(d.significance)}`)}
              </Badge>
            </li>
          ))}
        </ul>
        <Link
          href={{ pathname: "/muhurtham", query: { city: citySlug } }}
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          {t("viewCalendar")}
        </Link>
      </CardContent>
    </Card>
  );
}

function ListingSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-2/3" />
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <Skeleton className="aspect-[4/3]" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

/** Enquiry / reserve panel. Reads the session, so it is request-time (inside the page's Suspense). */
async function EnquirySection(props: {
  serviceId: string;
  instant: boolean;
  maxGuests: number | null;
  timeZone: string;
  locale: string;
  slug: string;
}) {
  await connection();
  const user = await getCurrentUser();
  const next = localizedPath(props.locale, `/listings/${props.slug}`);
  return (
    <EnquiryPanel
      serviceId={props.serviceId}
      instant={props.instant}
      signedIn={!!user}
      // Link adds the locale prefix itself; `next` is the full localized return path.
      loginHref={`/login?next=${encodeURIComponent(next)}`}
      today={todayIn(props.timeZone)}
      maxGuests={props.maxGuests}
    />
  );
}
