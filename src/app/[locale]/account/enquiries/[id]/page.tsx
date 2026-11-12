import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Clock } from "lucide-react";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { formatListingPrice, type PriceTranslator } from "@/features/discovery/lib/price";
import { cancelEnquiry, respondQuotation } from "@/features/enquiries/actions/customer";
import { MessageComposer } from "@/features/enquiries/components/message-composer";
import { MessageList, QuoteView } from "@/features/enquiries/components/quote-view";
import { holdRemaining } from "@/features/enquiries/lib/quote";
import { getEnquiryThread, rangeOf, snapshotOf } from "@/features/enquiries/queries";
import { formatPaise } from "@/lib/money";
import { BookNow } from "@/features/bookings/components/book-now";
import { getBookingForEnquiry, getBookingPreview } from "@/features/bookings/queries";
import { EnquiryEventSelect } from "@/features/events/components/people-forms";
import { listOwnedEvents } from "@/features/events/queries";
import type { PriceType, PriceUnit } from "@/types/database";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/account/enquiries/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "enquiries" });
  return { title: t("title"), robots: { index: false } };
}

const ACTIVE = new Set(["open", "quoted", "accepted", "reserved"]);

export default async function MyEnquiryPage({ params }: PageProps<"/[locale]/account/enquiries/[id]">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/account/enquiries"));
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const thread = await getEnquiryThread(id);
  if (!thread) notFound();
  await connection();

  const { enquiry: e, quotes, messages } = thread;
  // Co-hosts of the event can read the thread and write to the vendor; only the
  // customer who made the enquiry accepts quotes, books, pays or cancels.
  const isOwner = e.customer_id === user.id;
  const bookable = isOwner && (e.status === "accepted" || e.status === "reserved");
  const [t, tPrice, tB, tEv, booking, preview, myEvents] = await Promise.all([
    getTranslations("enquiries"),
    getTranslations("listing.price"),
    getTranslations("bookings"),
    getTranslations("events"),
    isOwner && e.status === "booked" ? getBookingForEnquiry(e.id) : null,
    bookable ? getBookingPreview(e.id) : null,
    isOwner ? listOwnedEvents(user.id) : Promise.resolve([]),
  ]);
  const snap = snapshotOf(e.price_snapshot);
  const range = rangeOf(e.period);
  const active = ACTIVE.has(e.status);
  const left = e.hold_expires_at ? holdRemaining(e.hold_expires_at) : null;
  const listed =
    snap.price_type !== undefined
      ? formatListingPrice(
          {
            price_type: snap.price_type as PriceType,
            price_unit: (snap.price_unit ?? null) as PriceUnit | null,
            base_price_paise: snap.base_price_paise ?? null,
            max_price_paise: snap.max_price_paise ?? null,
          },
          tPrice as unknown as PriceTranslator,
          locale,
        )
      : null;

  return (
    <div className="grid gap-6">
      <Link
        href="/account/enquiries"
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={snap.title ?? t("title")}
        description={snap.vendor_name}
        actions={<StatusBadge status={e.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("quotes")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {quotes.length === 0 ? <p className="text-muted-foreground text-sm">{t("noQuotes")}</p> : null}
              {quotes.map((q) => (
                <QuoteView key={q.id} quote={q}>
                  {isOwner && q.status === "sent" && e.status === "quoted" ? (
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        action={respondQuotation.bind(null, q.id, true)}
                        label={t("accept")}
                        successMessage={t("accepted")}
                        variant="default"
                        size="default"
                        confirm={{ title: t("acceptTitle"), description: t("acceptBody") }}
                        testId="accept-quote"
                      />
                      <ActionButton
                        action={respondQuotation.bind(null, q.id, false)}
                        label={t("decline")}
                        successMessage={t("declinedMsg")}
                        variant="outline"
                        size="default"
                      />
                    </div>
                  ) : null}
                </QuoteView>
              ))}
            </CardContent>
          </Card>

          {bookable && preview ? (
            <Card className="border-gold/50" data-testid="book-card">
              <CardHeader>
                <CardTitle>{tB("bookTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {preview.preview ? (
                  <>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                      <dt className="text-muted-foreground">{tB("total")}</dt>
                      <dd className="text-right font-semibold" data-testid="book-total">
                        {formatPaise(preview.preview.total_paise)}
                      </dd>
                      <dt className="text-muted-foreground">
                        {tB("advance", { percent: preview.preview.advance_bps / 100 })}
                      </dt>
                      <dd className="text-right" data-testid="book-advance">
                        {formatPaise(preview.preview.advance_paise)}
                      </dd>
                      <dt className="text-muted-foreground">{tB("policy")}</dt>
                      <dd className="text-right">{tB(`policies.${preview.preview.cancellation_policy}`)}</dd>
                    </dl>
                    <p className="text-muted-foreground text-xs">
                      {tB(`policyHints.${preview.preview.cancellation_policy}`)}
                    </p>
                    <BookNow
                      enquiryId={e.id}
                      confirmBody={tB("bookBody", {
                        advance: formatPaise(preview.preview.advance_paise),
                        time: formatDateTime(preview.preview.pay_by, locale),
                      })}
                    />
                  </>
                ) : (
                  <p>{tB("cannotBookOnline")}</p>
                )}
              </CardContent>
            </Card>
          ) : null}
          {booking ? (
            <Card data-testid="booking-link">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>{tB("enquiryBooked")}</span>
                <Link
                  href={`/account/bookings/${booking.id}`}
                  className="text-primary font-medium underline-offset-4 hover:underline"
                >
                  {tB("viewBooking")}
                </Link>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("conversation")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <MessageList messages={messages} viewerSide="customer" />
              {active || e.status === "booked" ? <MessageComposer enquiryId={e.id} /> : null}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("details")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p>
                <span className="text-muted-foreground">{t("when")}: </span>
                {range
                  ? `${formatDateTime(range.start, locale)} – ${formatDateTime(range.end, locale, undefined, { timeStyle: "short" })}`
                  : e.event_date}
              </p>
              {e.guests ? (
                <p>
                  <span className="text-muted-foreground">{t("guests")}: </span>
                  {e.guests}
                </p>
              ) : null}
              {listed ? (
                <p>
                  <span className="text-muted-foreground">{t("listedPrice")}: </span>
                  {listed}
                </p>
              ) : null}
              {e.message ? (
                <p>
                  <span className="text-muted-foreground">{t("yourMessage")}: </span>
                  {e.message}
                </p>
              ) : null}
              {active ? (
                <p className="bg-accent/50 flex items-start gap-2 rounded-md p-2" data-testid="hold-info">
                  <Clock className="text-gold mt-0.5 size-4 shrink-0" aria-hidden />
                  {e.hold_expires_at && left ? (
                    left.expired ? (
                      t("holdExpired")
                    ) : (
                      <span>
                        {t("heldUntil", { time: formatDateTime(e.hold_expires_at, locale) })} ·{" "}
                        {t("holdLeft", { hours: left.hours, minutes: left.minutes })}
                      </span>
                    )
                  ) : (
                    t("noHold")
                  )}
                </p>
              ) : null}
              {active && isOwner ? (
                <ActionButton
                  action={cancelEnquiry.bind(null, e.id)}
                  label={t("cancel")}
                  successMessage={t("cancelled")}
                  variant="outline"
                  size="default"
                  confirm={{ title: t("cancelTitle"), description: t("cancelBody"), destructive: true }}
                />
              ) : null}
            </CardContent>
          </Card>

          {isOwner ? (
            <Card data-testid="enquiry-event">
              <CardHeader>
                <CardTitle>{tEv("partOfEvent")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {myEvents.length > 0 ? (
                  <>
                    <EnquiryEventSelect
                      enquiryId={e.id}
                      current={e.event_id ?? ""}
                      events={myEvents.map((ev) => ({ id: ev.id, title: ev.title }))}
                    />
                    <p className="text-muted-foreground text-xs">{tEv("partOfEventHint")}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {tEv("noEventsYet")}{" "}
                    <Link
                      href="/account/events"
                      className="text-primary font-medium underline-offset-4 hover:underline"
                    >
                      {tEv("createOne")}
                    </Link>
                  </p>
                )}
                {e.event_id ? (
                  <Link
                    href={`/account/events/${e.event_id}`}
                    className="text-primary font-medium underline-offset-4 hover:underline"
                  >
                    {tEv("openEvent")}
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-muted-foreground text-sm" data-testid="cohost-note">
                {tEv("cohostEnquiryNote")}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
