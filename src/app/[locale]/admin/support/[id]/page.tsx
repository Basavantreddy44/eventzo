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
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { SupportReply } from "@/features/support/components/support-reply";
import { SupportStatusBadge } from "@/features/support/components/support-status";
import { TicketControls } from "@/features/support/components/ticket-controls";
import { TicketThread } from "@/features/support/components/ticket-thread";
import { getSupportAgents, getTicket, getTicketContext } from "@/features/support/queries";
import { isOverdue, ticketRef, type SupportStatus } from "@/features/support/schemas";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/support/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "support.desk" });
  return { title: t("title"), robots: { index: false } };
}

/** S2: one screen with the request, the booking, the vendor chat, payments and history. */
export default async function SupportTicketPage({ params }: PageProps<"/[locale]/admin/support/[id]">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/admin/support"));
  if (!hasPermission(user.access, "support.manage")) notFound();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [data, ctx, agents, t, tSupport, tBookings] = await Promise.all([
    getTicket(id),
    getTicketContext(id),
    getSupportAgents(),
    getTranslations("support.desk"),
    getTranslations("support"),
    getTranslations("bookings"),
  ]);
  if (!data || !ctx) notFound();
  const { ticket, messages } = data;
  const b = ctx.booking;
  const money = (p: number) => formatPaise(p, { currency: b?.currency ?? "INR" });

  return (
    <div className="grid gap-6">
      <Link
        href="/admin/support"
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={`${ticketRef(ticket.ref_no)} · ${tSupport(`topics.${ticket.topic as "other"}`)}`}
        description={
          ticket.first_response_at
            ? tSupport("repliedAt", { time: formatDateTime(ticket.first_response_at, locale) })
            : `${isOverdue(ticket) ? `${t("overdue")} · ` : ""}${tSupport("replyBy", { time: formatDateTime(ticket.sla_due_at, locale) })}`
        }
        actions={<SupportStatusBadge status={ticket.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("conversation")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <TicketThread messages={messages} locale={locale} viewer="agent" />
              <SupportReply ticketId={ticket.id} agent />
            </CardContent>
          </Card>

          {b ? (
            <Card data-testid="ticket-booking">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {t("booking")}: {b.listing ?? "—"} <StatusBadge status={b.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">{t("vendor")}</dt>
                  <dd>
                    {b.vendor_id ? (
                      <Link href={`/admin/vendors/${b.vendor_id}`} className="text-primary hover:underline">
                        {b.vendor}
                      </Link>
                    ) : (
                      b.vendor
                    )}
                    {b.vendor_phone ? ` · ${b.vendor_phone}` : ""}
                    {b.vendor_email ? ` · ${b.vendor_email}` : ""}
                  </dd>
                  <dt className="text-muted-foreground">{tBookings("when")}</dt>
                  <dd>{b.event_date}</dd>
                  <dt className="text-muted-foreground">{tBookings("total")}</dt>
                  <dd>{money(b.total_paise)}</dd>
                  <dt className="text-muted-foreground">{tBookings("paid")}</dt>
                  <dd data-testid="ticket-paid">{money(b.paid_paise)}</dd>
                  <dt className="text-muted-foreground">{t("balanceDue")}</dt>
                  <dd>{b.balance_due_on}</dd>
                  <dt className="text-muted-foreground">{t("policy")}</dt>
                  <dd>{tBookings(`policies.${b.cancellation_policy as "moderate"}`)}</dd>
                  {b.cancel_reason ? (
                    <>
                      <dt className="text-muted-foreground">{t("cancelReason")}</dt>
                      <dd>{b.cancel_reason}</dd>
                    </>
                  ) : null}
                </dl>

                <div className="grid gap-2">
                  <h3 className="font-medium">{t("payments")}</h3>
                  {ctx.payments.length === 0 ? (
                    <p className="text-muted-foreground">{t("none")}</p>
                  ) : (
                    <ul className="grid gap-1">
                      {ctx.payments.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={p.status} />
                          {tBookings(`kinds.${p.kind as "advance"}`)} · {money(p.amount_paise)} ·{" "}
                          {formatDateTime(p.paid_at ?? p.created_at, locale)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {ctx.refunds.length ? (
                    <ul className="grid gap-1">
                      {ctx.refunds.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={`refund_${r.status}`} />
                          {money(r.amount_paise)} · {formatDateTime(r.created_at, locale)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <h3 className="font-medium">{t("vendorChat")}</h3>
                  {ctx.vendor_messages.length === 0 ? (
                    <p className="text-muted-foreground">{t("none")}</p>
                  ) : (
                    <ol className="grid max-h-80 gap-2 overflow-y-auto">
                      {ctx.vendor_messages.map((m, i) => (
                        <li key={i} className="bg-muted/50 rounded-md p-2">
                          <span className="text-muted-foreground text-xs">
                            {t(`sides.${m.side as "customer"}`)} · {formatDateTime(m.created_at, locale)}
                          </span>
                          <p className="whitespace-pre-line">{m.body}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("manage")}</CardTitle>
            </CardHeader>
            <CardContent>
              <TicketControls
                ticketId={ticket.id}
                status={ticket.status as SupportStatus}
                priority={ticket.priority as "normal" | "high"}
                assignedTo={ticket.assigned_to}
                agents={agents}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("customer")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p className="font-medium">{ctx.customer?.name ?? "—"}</p>
              {ctx.customer?.email ? <p>{ctx.customer.email}</p> : null}
              {ctx.customer?.phone ? <p>{ctx.customer.phone}</p> : null}
              {ctx.customer ? (
                <Link href={`/admin/users/${ctx.customer.id}`} className="text-primary text-xs hover:underline">
                  {t("customerProfile")}
                </Link>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("history")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-2 text-xs" data-testid="ticket-history">
                {ctx.history.map((h, i) => (
                  <li key={i}>
                    <span className="text-muted-foreground">{formatDateTime(h.at, locale)}</span> ·{" "}
                    {h.actor ?? t("system")}:{" "}
                    {h.action.endsWith(".insert")
                      ? t("opened")
                      : h.fields?.includes("status") && h.status
                        ? t("statusChanged", { status: tSupport(`statuses.${h.status as "open"}`) })
                        : t("updatedFields", { fields: (h.fields ?? []).join(", ") })}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
