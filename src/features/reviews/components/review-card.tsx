import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { BadgeCheck } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { reviewPhotoUrl } from "@/lib/storage";
import { Stars } from "./stars";

export type ReviewView = {
  id: string;
  rating: number;
  body: string;
  photos: string[];
  reviewer?: string | null;
  event_month?: string | null;
  vendor_reply: string | null;
  vendor_replied_at: string | null;
  created_at: string;
};

/** One review with its "Verified booking" mark, photos and the vendor's reply. */
export async function ReviewCard({
  review,
  locale,
  vendorName,
}: {
  review: ReviewView;
  locale: string;
  vendorName?: string | null;
}) {
  const t = await getTranslations("reviews");
  return (
    <article className="grid gap-2 border-b pb-4 last:border-b-0 last:pb-0" data-testid="review">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Stars value={review.rating} label={t("outOf5", { rating: review.rating })} />
        {review.reviewer ? <span className="font-medium">{review.reviewer}</span> : null}
        <span className="text-success inline-flex items-center gap-1 text-xs font-medium">
          <BadgeCheck className="size-3.5" aria-hidden />
          {t("verified")}
        </span>
        {review.event_month ? (
          <span className="text-muted-foreground text-xs">
            {t("eventIn", {
              month: formatDateTime(`${review.event_month}T12:00:00Z`, locale, undefined, {
                month: "long",
                year: "numeric",
              }),
            })}
          </span>
        ) : null}
      </div>
      <p className="text-sm whitespace-pre-line">{review.body}</p>
      {review.photos.length ? (
        <div className="flex flex-wrap gap-2">
          {review.photos.map((p) => (
            <a
              key={p}
              href={reviewPhotoUrl(p)}
              target="_blank"
              rel="noreferrer"
              className="relative block size-20 overflow-hidden rounded-md border"
            >
              <Image src={reviewPhotoUrl(p)} alt={t("photoAlt")} fill sizes="80px" className="object-cover" />
            </a>
          ))}
        </div>
      ) : null}
      {review.vendor_reply ? (
        <div className="bg-muted/50 ml-4 rounded-md p-3 text-sm" data-testid="review-reply">
          <p className="mb-1 text-xs font-medium">{t("replyFrom", { vendor: vendorName ?? t("theVendor") })}</p>
          <p className="whitespace-pre-line">{review.vendor_reply}</p>
        </div>
      ) : null}
    </article>
  );
}
