import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { amountsDue } from "../lib/money";
import type { BookingSnapshot } from "../queries";

type Item = {
  status: string;
  currency: string;
  total_paise: number;
  advance_bps: number;
  advance_paise: number;
  paid_paise: number;
  cancellation_policy: string;
};
type Payment = {
  id: string;
  kind: string;
  method: string;
  status: string;
  amount_paise: number;
  offline_mode: string | null;
  reference: string | null;
  razorpay_payment_id?: string | null;
  receipt_number?: string | null;
  paid_at: string | null;
  created_at: string;
};
type Refund = {
  id: string;
  method: string;
  amount_paise: number;
  status: string;
  reference: string | null;
  reason: string | null;
  created_at: string;
};

/** Amounts, snapshotted quote lines, payments and refunds of one booking item (customer + vendor views). */
export async function BookingSummary({
  item,
  snapshot,
  payments,
  refunds,
  locale,
  refundAction,
}: {
  item: Item;
  snapshot: BookingSnapshot;
  payments: Payment[];
  refunds: Refund[];
  locale: string;
  refundAction?: (refund: Refund) => React.ReactNode;
}) {
  const t = await getTranslations("bookings");
  const money = (p: number) => formatPaise(p, { currency: item.currency });
  const { balance, advanceDue } = amountsDue(item);
  const q = snapshot.quotation;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("amounts")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm" data-testid="booking-amounts">
            <dt className="text-muted-foreground">{t("total")}</dt>
            <dd className="text-right font-semibold" data-testid="booking-total">
              {money(item.total_paise)}
            </dd>
            <dt className="text-muted-foreground">{t("advance", { percent: item.advance_bps / 100 })}</dt>
            <dd className="text-right">{money(item.advance_paise)}</dd>
            <dt className="text-muted-foreground">{t("paid")}</dt>
            <dd className="text-right" data-testid="booking-paid">
              {money(item.paid_paise)}
            </dd>
            {item.status === "pending_payment" ? (
              <>
                <dt className="text-muted-foreground">{t("advanceDue")}</dt>
                <dd className="text-right font-semibold">{money(advanceDue)}</dd>
              </>
            ) : null}
            {item.status === "pending_payment" || item.status === "confirmed" ? (
              <>
                <dt className="text-muted-foreground">{t("balance")}</dt>
                <dd className="text-right" data-testid="booking-balance">
                  {money(balance)}
                </dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">{t("policy")}</dt>
            <dd className="text-right">{t(`policies.${item.cancellation_policy as "moderate"}`)}</dd>
          </dl>
          <p className="text-muted-foreground mt-3 text-xs">
            {t(`policyHints.${item.cancellation_policy as "moderate"}`)}
          </p>
        </CardContent>
      </Card>

      {q && q.items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("quoteSnapshot", { version: q.version })}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {q.items.map((line, i) => (
              <p key={i} className="flex justify-between gap-4">
                <span className="min-w-0 break-words">
                  {line.description} × {line.quantity}
                </span>
                <span className="shrink-0">{money(line.amount_paise)}</span>
              </p>
            ))}
            {q.discount_paise ? (
              <p className="text-muted-foreground flex justify-between">
                <span>{t("discount")}</span>
                <span>−{money(q.discount_paise)}</span>
              </p>
            ) : null}
            {q.tax_paise ? (
              <p className="text-muted-foreground flex justify-between">
                <span>{t("tax", { percent: q.tax_bps / 100 })}</span>
                <span>{money(q.tax_paise)}</span>
              </p>
            ) : null}
            {q.terms ? <p className="text-muted-foreground mt-2 text-xs whitespace-pre-line">{q.terms}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("payments")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm" data-testid="payments">
          {payments.length === 0 ? <p className="text-muted-foreground">{t("noPayments")}</p> : null}
          {payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
              <div className="min-w-0">
                <p className="font-medium">
                  {money(p.amount_paise)} · {t(`kinds.${p.kind as "advance"}`)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {p.method === "offline" && p.offline_mode
                    ? t(`modes.${p.offline_mode as "cash"}`)
                    : p.razorpay_payment_id?.startsWith("pay_sim_")
                      ? t("methodSimulated")
                      : t("methodOnline")}
                  {p.reference ? ` · ${p.reference}` : ""}
                  {" · "}
                  {formatDateTime(p.paid_at ?? p.created_at, locale)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {p.status === "paid" && p.receipt_number ? (
                  <Link
                    href={`/receipts/${p.id}`}
                    className="text-primary text-xs underline-offset-4 hover:underline"
                    data-testid="receipt-link"
                  >
                    {t("receipt")}
                  </Link>
                ) : null}
                <StatusBadge status={p.status} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {refunds.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("refunds")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm" data-testid="refunds">
            {refunds.map((r) => (
              <div key={r.id} className="grid gap-2 border-b pb-2 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {money(r.amount_paise)} · {r.method === "offline" ? t("refundOffline") : t("refundOnline")}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {r.reason}
                      {r.reference ? ` · ${r.reference}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={`refund_${r.status}`} />
                </div>
                {refundAction?.(r)}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
