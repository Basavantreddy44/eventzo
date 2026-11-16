import { getTranslations } from "next-intl/server";
import { BadgeCheck, Scale } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime, intlLocale } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import type { Json } from "@/types/database";
import { acceptEventQuote } from "../actions";
import { getEventQuoteOptions } from "../queries";
import type { WorkspaceEvent } from "./event-tabs";

type Row = Awaited<ReturnType<typeof getEventQuoteOptions>>[number];

function localized(name: string, i18n: Json, locale: string) {
  const map = i18n && typeof i18n === "object" && !Array.isArray(i18n) ? (i18n as Record<string, unknown>) : {};
  return typeof map[locale] === "string" && map[locale] ? (map[locale] as string) : name;
}

/**
 * Roadmap C5: the quotes received for this event, side by side per category.
 * Accepting one withdraws the other open requests in that category, with a
 * polite note to each vendor.
 */
export async function QuotesTab({ event, locale, role }: { event: WorkspaceEvent; locale: string; role: string }) {
  const [t, tPolicy, rows] = await Promise.all([
    getTranslations("events.quotes"),
    getTranslations("bookings.policies"),
    getEventQuoteOptions(event.id),
  ]);
  const money = (p: number | null) => (p == null ? "—" : formatPaise(BigInt(p), { locale: intlLocale(locale) }));

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        title={t("emptyTitle")}
        description={t("emptyBody")}
        action={
          <Button asChild>
            <Link href={{ pathname: "/search", query: { category: "venues" } }}>{t("findVendors")}</Link>
          </Button>
        }
      />
    );
  }

  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(r.category_slug, [...(groups.get(r.category_slug) ?? []), r]);

  return (
    <div className="grid gap-8" data-testid="event-quotes">
      <p className="text-muted-foreground text-sm">{t("intro")}</p>
      {[...groups.entries()].map(([slug, quotes]) => {
        const accepted = quotes.find((q) => q.quotation_status === "accepted");
        const cheapest = Math.min(...quotes.map((q) => q.total_paise));
        return (
          <section key={slug} className="grid gap-3" aria-labelledby={`quotes-${slug}`}>
            <h2 id={`quotes-${slug}`} className="text-lg font-semibold">
              {localized(quotes[0].category_name, quotes[0].category_name_i18n, locale)}
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {t("count", { count: quotes.length })}
              </span>
            </h2>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[36rem] border-collapse text-sm" data-testid={`quotes-table-${slug}`}>
                <thead>
                  <tr>
                    <th scope="col" className="bg-muted/40 w-36 p-3 text-left font-medium">
                      <span className="sr-only">{t("feature")}</span>
                    </th>
                    {quotes.map((q) => (
                      <th key={q.quotation_id} scope="col" className="p-3 text-left align-top font-normal">
                        <div className="grid gap-1">
                          {q.listing_slug ? (
                            <Link
                              href={`/listings/${q.listing_slug}`}
                              className="text-primary font-semibold underline-offset-4 hover:underline"
                            >
                              {q.listing_title}
                            </Link>
                          ) : (
                            <span className="font-semibold">{q.listing_title}</span>
                          )}
                          <span className="text-muted-foreground flex items-center gap-1 text-xs">
                            {q.vendor_name}
                            {q.verified ? (
                              <BadgeCheck className="text-success size-3.5" aria-label={t("verified")} />
                            ) : null}
                          </span>
                          {q.quotation_status === "accepted" ? <Badge variant="success">{t("accepted")}</Badge> : null}
                          {q.total_paise === cheapest && quotes.length > 1 && !accepted ? (
                            <Badge variant="gold">{t("lowest")}</Badge>
                          ) : null}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <th scope="row" className="bg-muted/40 p-3 text-left font-medium">
                      {t("total")}
                    </th>
                    {quotes.map((q) => (
                      <td key={q.quotation_id} className="text-primary-strong p-3 text-base font-semibold">
                        {money(q.total_paise)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t">
                    <th scope="row" className="bg-muted/40 p-3 text-left font-medium">
                      {t("includes")}
                    </th>
                    {quotes.map((q) => (
                      <td key={q.quotation_id} className="p-3 align-top">
                        <ul className="grid gap-0.5">
                          {(q.items as { description: string; quantity: number; amount_paise: number }[]).map(
                            (i, n) => (
                              <li key={n}>
                                {i.description}
                                {i.quantity > 1 ? ` × ${i.quantity}` : ""}
                                <span className="text-muted-foreground"> · {money(i.amount_paise)}</span>
                              </li>
                            ),
                          )}
                        </ul>
                        {q.discount_paise > 0 ? (
                          <p className="text-muted-foreground text-xs">
                            {t("discount", { amount: money(q.discount_paise) })}
                          </p>
                        ) : null}
                        {q.tax_paise > 0 ? (
                          <p className="text-muted-foreground text-xs">{t("tax", { amount: money(q.tax_paise) })}</p>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t">
                    <th scope="row" className="bg-muted/40 p-3 text-left font-medium">
                      {t("advance")}
                    </th>
                    {quotes.map((q) => (
                      <td key={q.quotation_id} className="p-3">
                        {money(Math.ceil((q.total_paise * q.advance_bps) / 10000))}{" "}
                        <span className="text-muted-foreground text-xs">({q.advance_bps / 100}%)</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t">
                    <th scope="row" className="bg-muted/40 p-3 text-left font-medium">
                      {t("cancellation")}
                    </th>
                    {quotes.map((q) => (
                      <td key={q.quotation_id} className="p-3">
                        {tPolicy(q.cancellation_policy as "moderate")}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t">
                    <th scope="row" className="bg-muted/40 p-3 text-left font-medium">
                      {t("validUntil")}
                    </th>
                    {quotes.map((q) => (
                      <td key={q.quotation_id} className="p-3">
                        {q.valid_until ? formatDateTime(q.valid_until, locale) : "—"}
                      </td>
                    ))}
                  </tr>
                  {quotes.some((q) => q.notes) ? (
                    <tr className="border-t">
                      <th scope="row" className="bg-muted/40 p-3 text-left font-medium">
                        {t("notes")}
                      </th>
                      {quotes.map((q) => (
                        <td key={q.quotation_id} className="p-3 text-xs whitespace-pre-line">
                          {q.notes ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                  <tr className="border-t">
                    <th scope="row" className="bg-muted/40 p-3 text-left font-medium">
                      <span className="sr-only">{t("action")}</span>
                    </th>
                    {quotes.map((q) => (
                      <td key={q.quotation_id} className="p-3">
                        {q.quotation_status === "accepted" ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/account/enquiries/${q.enquiry_id}`}>{t("nextStep")}</Link>
                          </Button>
                        ) : q.is_owner && role === "owner" && q.enquiry_status === "quoted" && !accepted ? (
                          <ActionButton
                            action={acceptEventQuote.bind(null, q.quotation_id)}
                            label={t("accept")}
                            successMessage={t("acceptedToast")}
                            variant="default"
                            testId={`accept-${q.quotation_id}`}
                            confirm={{
                              title: t("acceptTitle", { vendor: q.vendor_name }),
                              description:
                                quotes.length > 1
                                  ? t("acceptBodyOthers", { count: quotes.length - 1 })
                                  : t("acceptBody"),
                            }}
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {q.enquiry_status === "cancelled" ? t("withdrawn") : "—"}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
