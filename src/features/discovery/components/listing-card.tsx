import { getLocale, getTranslations } from "next-intl/server";
import { BadgeCheck, MapPin, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { formatPaise } from "@/lib/money";
import { intlLocale } from "@/lib/datetime";
import type { ListingSummary } from "@/types/database";
import { formatListingPrice, type PriceTranslator } from "../lib/price";
import { ListingCover } from "./listing-cover";

export async function ListingCard({ listing }: { listing: ListingSummary }) {
  const t = await getTranslations("listing");
  const tPrice = (await getTranslations("listing.price")) as unknown as PriceTranslator;
  const locale = await getLocale();
  const place = [listing.area_name, listing.city_name].filter(Boolean).join(", ");

  return (
    <article className="group bg-card relative flex h-full flex-col overflow-hidden rounded-xl border shadow-xs transition-shadow hover:shadow-md">
      <ListingCover
        path={listing.cover_path}
        alt={listing.title}
        icon={listing.business_category_icon}
        placeholderLabel={listing.service_category_name}
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{listing.service_category_name}</Badge>
          {listing.verified ? (
            <Badge variant="success">
              <BadgeCheck aria-hidden />
              {t("verified")}
            </Badge>
          ) : null}
        </div>
        <h3 className="text-base leading-snug font-semibold">
          {/* The whole card is clickable via the stretched link. */}
          <Link href={`/listings/${listing.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {listing.title}
          </Link>
        </h3>
        <p className="text-muted-foreground text-sm">{listing.organization_name}</p>
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {place ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {place}
            </span>
          ) : null}
          {listing.max_capacity ? (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden />
              {t("capacity", { count: listing.max_capacity })}
            </span>
          ) : null}
        </div>
        <p className="text-primary-strong mt-auto pt-2 font-semibold">{formatListingPrice(listing, tPrice, locale)}</p>
        {listing.veg_price_per_plate_paise !== null && listing.price_unit !== "per_plate" ? (
          <p className="text-muted-foreground text-xs">
            {t("vegPerPlate", {
              amount: formatPaise(BigInt(listing.veg_price_per_plate_paise), { locale: intlLocale(locale) }),
            })}
          </p>
        ) : null}
      </div>
    </article>
  );
}
