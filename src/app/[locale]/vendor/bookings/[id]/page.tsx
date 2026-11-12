import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { localeFrom } from "@/i18n/params";
import { getEnquiryContact, rangeOf } from "@/features/enquiries/queries";
import { amountsDue } from "@/features/bookings/lib/money";
import { BookingSummary } from "@/features/bookings/components/booking-summary";
import { CancelBooking } from "@/features/bookings/components/cancel-booking";
import { ManualRefund } from "@/features/bookings/components/manual-refund";
import { OfflinePaymentForm } from "@/features/bookings/components/offline-payment-form";
import { bookingSnapshotOf, getBookingItem } from "@/features/bookings/queries";
import { loadVendorPage } from "@/features/vendor/lib/page";
import { todayIn } from "@/features/muhurtham/lib/calendar";
import { JobTeam } from "@/features/staff/components/job-team";
import { getJobForBooking, listAssignableStaff } from "@/features/staff/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/bookings/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendorBookings" });
  return { title: t("title"), robots: { index: false } };
}

const toRupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

export default async function VendorBookingPage({ params }: PageProps<"/[locale]/vendor/bookings/[id]">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/bookings");
  if (!ctx) return null;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getBookingItem(id);
  if (!data || data.item.organization_id !== ctx.membership.organization_id) notFound();

  const { item, payments, refunds } = data;
  const [t, tB, tStaff, contact, jobData, staffOptions] = await Promise.all([
    getTranslations("vendorBookings"),
    getTranslations("bookings"),
    getTranslations("staff"),
    getEnquiryContact(item.enquiry_id),
    getJobForBooking(item.id),
    listAssignableStaff(ctx.membership.organization_id, item.branch_id ?? null),
  ]);
  const snap = bookingSnapshotOf(item.snapshot);
  const range = rangeOf(item.period);
  const open = item.status === "pending_payment" || item.status === "confirmed";
  const { balance, advanceDue } = amountsDue(item);
  const money = (p: number) => formatPaise(p, { currency: item.currency });

  return (
    <div className="grid gap-6">
      <Link
        href="/vendor/bookings"
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={snap.listing?.title ?? t("title")}
        description={contact?.name ?? undefined}
        actions={<StatusBadge status={item.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{tB("details")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p>
                <span className="text-muted-foreground">{tB("when")}: </span>
                {range
                  ? `${formatDateTime(range.start, locale)} – ${formatDateTime(range.end, locale, undefined, { timeStyle: "short" })}`
                  : item.event_date}
              </p>
              {item.guests ? (
                <p>
                  <span className="text-muted-foreground">{tB("guests")}: </span>
                  {item.guests}
                </p>
              ) : null}
              {item.status === "pending_payment" ? (
                <p>
                  <span className="text-muted-foreground">{t("advanceDueBy")}: </span>
                  {formatDateTime(item.payment_due_at, locale)}
                </p>
              ) : null}
              {item.cancel_reason ? (
                <p>
                  <span className="text-muted-foreground">
                    {tB(`closedBy.${(item.cancelled_by_side ?? "system") as "system"}`)}:{" "}
                  </span>
                  {item.cancel_reason}
                </p>
              ) : null}
              <div className="mt-2 grid gap-1 border-t pt-2" data-testid="booking-customer">
                <p>
                  <span className="text-muted-foreground">{t("customer")}: </span>
                  {contact?.name}
                </p>
                {contact?.phone ? (
                  <p>
                    <span className="text-muted-foreground">{t("phone")}: </span>
                    {contact.phone}
                  </p>
                ) : null}
                {contact?.email ? (
                  <p>
                    <span className="text-muted-foreground">{t("email")}: </span>
                    {contact.email}
                  </p>
                ) : null}
              </div>
              <Link
                href={`/vendor/enquiries/${item.enquiry_id}`}
                className="text-primary mt-1 underline-offset-4 hover:underline"
              >
                {tB("toConversation")}
              </Link>
            </CardContent>
          </Card>

          {range && (item.status === "confirmed" || jobData) ? (
            <Card data-testid="booking-team">
              <CardHeader>
                <CardTitle>{tStaff("teamTitle")}</CardTitle>
                <p className="text-muted-foreground text-sm">{tStaff("teamHint")}</p>
              </CardHeader>
              <CardContent>
                <JobTeam
                  job={jobData?.job ?? null}
                  bookingItemId={item.id}
                  startsAt={range.start.toISOString()}
                  endsAt={range.end.toISOString()}
                  assignments={jobData?.assignments ?? []}
                  staffOptions={staffOptions}
                  locale={locale}
                  today={todayIn("Asia/Kolkata")}
                  idPrefix="bk"
                />
              </CardContent>
            </Card>
          ) : null}

          <BookingSummary
            item={item}
            snapshot={snap}
            payments={payments}
            refunds={refunds}
            locale={locale}
            refundAction={(r) =>
              r.method === "offline" && (r.status === "pending" || r.status === "failed") ? (
                <ManualRefund refundId={r.id} />
              ) : r.method === "razorpay" && r.status === "pending" ? (
                <p className="text-muted-foreground text-xs">{t("onlineRefundByFinance")}</p>
              ) : null
            }
          />
        </div>

        <div className="grid content-start gap-6">
          {open && balance > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("recordTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="text-muted-foreground text-sm">
                  {item.status === "pending_payment"
                    ? t("recordAdvanceHint", { amount: money(advanceDue) })
                    : t("recordBalanceHint", { amount: money(balance) })}
                </p>
                <OfflinePaymentForm
                  itemId={item.id}
                  suggestedRupees={toRupees(item.status === "pending_payment" ? advanceDue : balance)}
                />
              </CardContent>
            </Card>
          ) : null}
          {open ? (
            <Card>
              <CardHeader>
                <CardTitle>{tB("cancelTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CancelBooking
                  itemId={item.id}
                  side="vendor"
                  refundText={
                    item.paid_paise > 0
                      ? t("vendorCancelRefund", { amount: money(item.paid_paise) })
                      : t("vendorCancelNothingPaid")
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <p className="text-muted-foreground text-sm">{tB("closed")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
