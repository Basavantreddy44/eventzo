import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/status-badge";
import { formatPaise } from "@/lib/money";
import { formatDateTime, intlLocale } from "@/lib/datetime";

type Quote = {
  id: string;
  version: number;
  status: string;
  valid_until: string;
  subtotal_paise: number;
  discount_paise: number;
  tax_bps: number;
  tax_paise: number;
  total_paise: number;
  notes: string | null;
  terms: string | null;
  quotation_items: { description: string; quantity: number; unit_price_paise: number; amount_paise: number }[];
};

/** Read-only quotation (both sides). Actions are rendered by the caller as `children`. */
export async function QuoteView({ quote, children }: { quote: Quote; children?: React.ReactNode }) {
  const [t, tQ, locale] = await Promise.all([getTranslations("enquiries"), getTranslations("quote"), getLocale()]);
  const money = (p: number) => formatPaise(BigInt(p), { locale: intlLocale(locale) });

  return (
    <article className="grid gap-3 rounded-lg border p-4" data-testid={`quote-v${quote.version}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{t("quoteVersion", { version: quote.version })}</h3>
        <div className="flex items-center gap-2">
          {quote.status === "sent" ? (
            <span className="text-muted-foreground text-xs">
              {t("validUntil", { time: formatDateTime(quote.valid_until, locale) })}
            </span>
          ) : null}
          <StatusBadge status={quote.status} />
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-left text-xs uppercase">
              <th className="py-1 font-medium">{tQ("colItem")}</th>
              <th className="py-1 text-right font-medium">{tQ("colQty")}</th>
              <th className="py-1 text-right font-medium">{tQ("colPrice")}</th>
              <th className="py-1 text-right font-medium">{tQ("colAmount")}</th>
            </tr>
          </thead>
          <tbody>
            {quote.quotation_items.map((item, i) => (
              <tr key={i} className="border-t">
                <td className="py-1.5">{item.description}</td>
                <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
                <td className="py-1.5 text-right tabular-nums">{money(item.unit_price_paise)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(item.amount_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-1 text-sm">
        <div className="flex justify-between">
          <dt>{tQ("subtotal")}</dt>
          <dd className="tabular-nums">{money(quote.subtotal_paise)}</dd>
        </div>
        {quote.discount_paise > 0 ? (
          <div className="flex justify-between">
            <dt>{tQ("discount")}</dt>
            <dd className="tabular-nums">− {money(quote.discount_paise)}</dd>
          </div>
        ) : null}
        {quote.tax_paise > 0 ? (
          <div className="flex justify-between">
            <dt>{tQ("tax", { percent: quote.tax_bps / 100 })}</dt>
            <dd className="tabular-nums">{money(quote.tax_paise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <dt>{tQ("total")}</dt>
          <dd className="tabular-nums" data-testid="quote-total">
            {money(quote.total_paise)}
          </dd>
        </div>
      </dl>
      {quote.notes ? (
        <p className="text-sm">
          <span className="text-muted-foreground">{tQ("notes")}: </span>
          {quote.notes}
        </p>
      ) : null}
      {quote.terms ? (
        <p className="text-muted-foreground text-xs whitespace-pre-line">
          <span className="font-medium">{tQ("terms")}: </span>
          {quote.terms}
        </p>
      ) : null}
      {children}
    </article>
  );
}

/** Message list for an enquiry thread. */
export async function MessageList({
  messages,
  viewerSide,
}: {
  messages: { id: string; sender_side: string; body: string; created_at: string }[];
  viewerSide: "customer" | "vendor";
}) {
  const [t, locale] = await Promise.all([getTranslations("enquiries"), getLocale()]);
  if (messages.length === 0) return <p className="text-muted-foreground text-sm">{t("noMessages")}</p>;
  const label = (side: string) =>
    side === viewerSide ? t("you") : side === "system" ? t("system") : side === "vendor" ? t("vendor") : t("customer");
  return (
    <ul className="grid gap-2" data-testid="messages">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`rounded-lg px-3 py-2 text-sm ${m.sender_side === viewerSide ? "bg-primary/5 ml-8" : "bg-muted mr-8"}`}
        >
          <p className="text-muted-foreground mb-0.5 text-xs">
            {label(m.sender_side)} · {formatDateTime(m.created_at, locale)}
          </p>
          <p className="whitespace-pre-line">{m.body}</p>
        </li>
      ))}
    </ul>
  );
}
