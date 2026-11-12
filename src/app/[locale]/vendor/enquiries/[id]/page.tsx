import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { withdrawQuotation } from "@/features/enquiries/actions/vendor";
import { DeclineEnquiry } from "@/features/enquiries/components/decline-enquiry";
import { MessageComposer } from "@/features/enquiries/components/message-composer";
import { QuoteBuilder } from "@/features/enquiries/components/quote-builder";
import { MessageList, QuoteView } from "@/features/enquiries/components/quote-view";
import { applySurcharge } from "@/features/enquiries/lib/quote";
import { getEnquiryContact, getEnquiryThread, rangeOf, snapshotOf } from "@/features/enquiries/queries";
import { loadVendorPage } from "@/features/vendor/lib/page";
import { getBookingForEnquiry } from "@/features/bookings/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/enquiries/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendorEnquiries" });
  return { title: t("title"), robots: { index: false } };
}

const ACTIVE = new Set(["open", "quoted", "accepted", "reserved"]);
const toRupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

export default async function VendorEnquiryPage({ params }: PageProps<"/[locale]/vendor/enquiries/[id]">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/enquiries");
  if (!ctx) return null;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [thread, contact] = await Promise.all([getEnquiryThread(id), getEnquiryContact(id)]);
  if (!thread || thread.enquiry.organization_id !== ctx.membership.organization_id) notFound();

  const { enquiry: e, quotes, messages } = thread;
  const [t, tEnq, tB, booking] = await Promise.all([
    getTranslations("vendorEnquiries"),
    getTranslations("enquiries"),
    getTranslations("bookings"),
    e.status === "booked" ? getBookingForEnquiry(e.id) : null,
  ]);
  const snap = snapshotOf(e.price_snapshot);
  const range = rangeOf(e.period);
  const canQuote = e.status === "open" || e.status === "quoted";
  const surcharge = snap.surcharge_bps ?? 0;
  const base = snap.base_price_paise ? applySurcharge(snap.base_price_paise, surcharge) : null;

  return (
    <div className="grid gap-6">
      <Link
        href="/vendor/enquiries"
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={snap.title ?? t("title")}
        description={contact?.name ?? undefined}
        actions={<StatusBadge status={e.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{tEnq("details")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p>
                <span className="text-muted-foreground">{tEnq("when")}: </span>
                {range
                  ? `${formatDateTime(range.start, locale)} – ${formatDateTime(range.end, locale, undefined, { timeStyle: "short" })}`
                  : e.event_date}
              </p>
              {e.guests ? (
                <p>
                  <span className="text-muted-foreground">{tEnq("guests")}: </span>
                  {e.guests}
                </p>
              ) : null}
              {e.message ? <p className="bg-muted rounded-md p-2 whitespace-pre-line">{e.message}</p> : null}
              {e.hold_expires_at && ACTIVE.has(e.status) ? (
                <p>
                  <span className="text-muted-foreground">{t("colHold")}: </span>
                  {formatDateTime(e.hold_expires_at, locale)}
                </p>
              ) : null}
              <div className="mt-2 grid gap-1 border-t pt-2" data-testid="customer-contact">
                <p>
                  <span className="text-muted-foreground">{t("customer")}: </span>
                  {contact?.name}
                </p>
                {contact?.phone || contact?.email ? (
                  <>
                    {contact.phone ? (
                      <p>
                        <span className="text-muted-foreground">{t("phone")}: </span>
                        {contact.phone}
                      </p>
                    ) : null}
                    {contact.email ? (
                      <p>
                        <span className="text-muted-foreground">{t("email")}: </span>
                        {contact.email}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">{t("contactHidden")}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {quotes.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{tEnq("quotes")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {quotes.map((q) => (
                  <QuoteView key={q.id} quote={q}>
                    {q.status === "sent" ? (
                      <ActionButton
                        action={withdrawQuotation.bind(null, q.id)}
                        label={t("withdraw")}
                        successMessage={t("withdrawn")}
                        variant="outline"
                      />
                    ) : null}
                  </QuoteView>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{tEnq("conversation")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <MessageList messages={messages} viewerSide="vendor" />
              {ACTIVE.has(e.status) || e.status === "booked" ? <MessageComposer enquiryId={e.id} /> : null}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          {booking ? (
            <Card data-testid="booking-link">
              <CardContent className="grid gap-2 text-sm">
                <span>{tB("enquiryBookedVendor")}</span>
                <Link
                  href={`/vendor/bookings/${booking.id}`}
                  className="text-primary font-medium underline-offset-4 hover:underline"
                >
                  {tB("viewBooking")}
                </Link>
              </CardContent>
            </Card>
          ) : null}
          {canQuote ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("quoteTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <QuoteBuilder
                  suggestion={
                    base !== null
                      ? t("suggested", {
                          surcharge: surcharge ? t("suggestedSurcharge", { percent: surcharge / 100 }) : "",
                        })
                      : null
                  }
                  initial={{
                    enquiryId: e.id,
                    items: [
                      { description: snap.title ?? "", quantity: "1", unitPrice: base !== null ? toRupees(base) : "" },
                    ],
                    discount: "",
                    taxPercent: "",
                    validHours: "48",
                    notes: "",
                    terms: "",
                  }}
                />
              </CardContent>
            </Card>
          ) : null}
          {ACTIVE.has(e.status) ? (
            <Card>
              <CardContent>
                <DeclineEnquiry enquiryId={e.id} />
              </CardContent>
            </Card>
          ) : (
            <p className="text-muted-foreground text-sm">{t("closed")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
