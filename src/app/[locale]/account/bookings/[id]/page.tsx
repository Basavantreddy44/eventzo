import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Clock } from "lucide-react";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { requireUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { rangeOf } from "@/features/enquiries/queries";
import { holdRemaining } from "@/features/enquiries/lib/quote";
import { amountsDue } from "@/features/bookings/lib/money";
import { BookingSummary } from "@/features/bookings/components/booking-summary";
import { CancelBooking } from "@/features/bookings/components/cancel-booking";
import { PayOnline } from "@/features/bookings/components/pay-online";
import { bookingSnapshotOf, getBookingItem, getCancellationQuote } from "@/features/bookings/queries";
import { getPaymentMode } from "@/features/payments/lib/razorpay";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/account/bookings/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "bookings" });
  return { title: t("title"), robots: { index: false } };
}

export default async function MyBookingPage({ params }: PageProps<"/[locale]/account/bookings/[id]">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/account/bookings"));
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getBookingItem(id);
  if (!data || data.item.customer_id !== user.id) notFound();
  await connection();

  const { item, payments, refunds } = data;
  const open = item.status === "pending_payment" || item.status === "confirmed";
  const [t, quote] = await Promise.all([getTranslations("bookings"), open ? getCancellationQuote(item.id) : null]);
  const snap = bookingSnapshotOf(item.snapshot);
  const range = rangeOf(item.period);
  const money = (p: number) => formatPaise(p, { currency: item.currency });
  const { payable } = amountsDue(item);
  const left = item.status === "pending_payment" ? holdRemaining(item.payment_due_at) : null;
  const payMode = getPaymentMode();

  return (
    <div className="grid gap-6">
      <Link
        href="/account/bookings"
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={snap.listing?.title ?? t("title")}
        description={snap.listing?.vendor_name}
        actions={<StatusBadge status={item.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-6">
          {payMode === "simulator" && open ? (
            <p className="bg-gold/10 border-gold/40 rounded-md border p-3 text-xs" data-testid="sim-banner">
              {t("simBanner")}
            </p>
          ) : null}
          {item.status === "pending_payment" ? (
            <Card className="border-gold/50">
              <CardHeader>
                <CardTitle>{t("payAdvanceTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <p className="flex items-start gap-2" data-testid="pay-by">
                  <Clock className="text-gold mt-0.5 size-4 shrink-0" aria-hidden />
                  {left && !left.expired
                    ? t("payBy", {
                        time: formatDateTime(item.payment_due_at, locale),
                        hours: left.hours,
                        minutes: left.minutes,
                      })
                    : t("payWindowOver")}
                </p>
                {left && !left.expired ? (
                  <>
                    <PayOnline
                      itemId={item.id}
                      label={t("payAmount", { amount: money(payable) })}
                      amountLabel={money(payable)}
                      mode={payMode}
                      disabledReason={t("paymentsUnavailable")}
                    />
                    <p className="text-muted-foreground text-xs">{t("payOfflineHint")}</p>
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          {item.status === "confirmed" && payable > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("confirmedTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <p>{t("confirmedBody", { amount: money(payable) })}</p>
                <PayOnline
                  itemId={item.id}
                  label={t("payBalance", { amount: money(payable) })}
                  amountLabel={money(payable)}
                  mode={payMode}
                  disabledReason={t("paymentsUnavailable")}
                />
              </CardContent>
            </Card>
          ) : null}
          {item.status === "confirmed" && payable === 0 ? (
            <p className="bg-accent/50 rounded-md p-3 text-sm" data-testid="fully-paid">
              {t("fullyPaid")}
            </p>
          ) : null}
          {item.status === "cancelled" || item.status === "expired" ? (
            <p className="bg-muted rounded-md p-3 text-sm">
              {item.cancel_reason
                ? `${t(`closedBy.${(item.cancelled_by_side ?? "system") as "system"}`)}: ${item.cancel_reason}`
                : t("closed")}
            </p>
          ) : null}

          <BookingSummary item={item} snapshot={snap} payments={payments} refunds={refunds} locale={locale} />
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
                  : item.event_date}
              </p>
              {item.guests ? (
                <p>
                  <span className="text-muted-foreground">{t("guests")}: </span>
                  {item.guests}
                </p>
              ) : null}
              <Link
                href={`/account/enquiries/${item.enquiry_id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {t("toConversation")}
              </Link>
            </CardContent>
          </Card>
          {open && quote ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("cancelTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CancelBooking
                  itemId={item.id}
                  side="customer"
                  refundText={
                    item.paid_paise === 0
                      ? t("cancelNothingPaid")
                      : Number(quote.refund_paise) > 0
                        ? t("refundPreview", {
                            amount: money(Number(quote.refund_paise)),
                            percent: quote.refund_bps / 100,
                          })
                        : t("refundNone")
                  }
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
