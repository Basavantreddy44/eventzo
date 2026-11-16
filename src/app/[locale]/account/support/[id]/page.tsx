import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { bookingSnapshotOf } from "@/features/bookings/queries";
import { SupportReply } from "@/features/support/components/support-reply";
import { SupportStatusBadge } from "@/features/support/components/support-status";
import { TicketThread } from "@/features/support/components/ticket-thread";
import { getTicket } from "@/features/support/queries";
import { ticketRef } from "@/features/support/schemas";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/account/support/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "support" });
  return { title: t("title"), robots: { index: false } };
}

export default async function MyTicketPage({ params }: PageProps<"/[locale]/account/support/[id]">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/account/support"));
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getTicket(id);
  if (!data || data.ticket.customer_id !== user.id) notFound();
  const { ticket, messages } = data;
  const t = await getTranslations("support");
  const listing = bookingSnapshotOf(ticket.booking_items?.snapshot ?? null).listing;

  return (
    <div className="grid gap-6">
      <Link
        href="/account/support"
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={`${t(`topics.${ticket.topic as "other"}`)} · ${ticketRef(ticket.ref_no)}`}
        description={listing?.title ?? undefined}
        actions={<SupportStatusBadge status={ticket.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardContent className="grid gap-4 pt-6">
            <TicketThread messages={messages} locale={locale} viewer="customer" />
            {ticket.status === "closed" ? (
              <p className="text-muted-foreground text-sm">{t("closedNotice")}</p>
            ) : (
              <SupportReply ticketId={ticket.id} />
            )}
          </CardContent>
        </Card>
        <Card className="content-start">
          <CardHeader>
            <CardTitle>{t("aboutRequest")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">{t("colOpened")}: </span>
              {formatDateTime(ticket.created_at, locale)}
            </p>
            <p data-testid="ticket-sla">
              {ticket.first_response_at
                ? t("repliedAt", { time: formatDateTime(ticket.first_response_at, locale) })
                : t("replyBy", { time: formatDateTime(ticket.sla_due_at, locale) })}
            </p>
            {ticket.booking_item_id ? (
              <Link
                href={`/account/bookings/${ticket.booking_item_id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {t("toBooking")}
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
