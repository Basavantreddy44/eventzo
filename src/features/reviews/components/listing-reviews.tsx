import { getTranslations } from "next-intl/server";
import { MessageSquareQuote } from "lucide-react";
import { getListingReviews } from "../queries";
import { ReviewCard } from "./review-card";
import { Stars } from "./stars";

/** Public listing section: rating summary + newest verified reviews. */
export async function ListingReviews({
  serviceId,
  vendorName,
  locale,
}: {
  serviceId: string;
  vendorName: string;
  locale: string;
}) {
  const [t, data] = await Promise.all([getTranslations("reviews"), getListingReviews(serviceId)]);

  return (
    <section className="grid gap-4" aria-labelledby="listing-reviews" data-testid="listing-reviews">
      <h2 id="listing-reviews" className="text-xl font-semibold">
        {t("title")}
      </h2>
      {data.total === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <MessageSquareQuote className="size-4" aria-hidden />
          {t("none")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-3xl font-semibold" data-testid="rating-average">
              {data.average?.toFixed(1)}
            </span>
            <div className="grid gap-1">
              <Stars value={data.average ?? 0} label={t("outOf5", { rating: data.average ?? 0 })} />
              <span className="text-muted-foreground text-xs">{t("count", { count: data.total })}</span>
            </div>
            <dl className="text-muted-foreground grid grid-cols-[auto_8rem_auto] items-center gap-x-2 text-xs">
              {[5, 4, 3, 2, 1].map((n) => {
                const c = data.stars[n - 1] ?? 0;
                return (
                  <div key={n} className="contents">
                    <dt>{t("starShort", { count: n })}</dt>
                    <dd className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <span
                        className="bg-gold block h-full"
                        style={{ width: `${data.total ? (c / data.total) * 100 : 0}%` }}
                      />
                    </dd>
                    <dd>{c}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
          <div className="grid gap-4">
            {data.reviews.map((r) => (
              <ReviewCard key={r.id} review={r} locale={locale} vendorName={vendorName} />
            ))}
          </div>
        </>
      )}
      <p className="text-muted-foreground text-xs">{t("onlyVerified")}</p>
    </section>
  );
}
