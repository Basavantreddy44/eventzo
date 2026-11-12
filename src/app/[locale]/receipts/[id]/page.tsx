import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { siteConfig } from "@/config/site";
import { requireUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/auth/portal-user";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { localeFrom } from "@/i18n/params";
import { PrintButton } from "@/features/finance/components/finance-forms";
import { amountInWordsINR } from "@/features/finance/lib/finance";
import { getReceipt } from "@/features/finance/queries";
import { rangeOf } from "@/features/enquiries/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/receipts/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "receipt" });
  return { title: t("title"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/**
 * Printable payment receipt for the customer, the vendor (owners / branch
 * managers) and finance. Not a GST tax invoice (D8).
 */
export default async function ReceiptPage({ params }: PageProps<"/[locale]/receipts/[id]">) {
  const locale = await localeFrom(params);
  const { id } = await params;
  await requireUser(locale, localizedPath(locale, `/receipts/${id}`));
  if (!z.uuid().safeParse(id).success) notFound();
  const r = await getReceipt(id);
  if (!r) notFound();

  const [t, tB, tModes] = await Promise.all([
    getTranslations("receipt"),
    getTranslations("bookings"),
    getTranslations("bookings.modes"),
  ]);
  const money = (p: number) => formatPaise(p, { currency: r.currency });
  const range = rangeOf(r.booking.period);
  const method =
    r.method === "offline" && r.offline_mode
      ? tModes(r.offline_mode as "cash")
      : r.gateway_payment_id?.startsWith("pay_sim_")
        ? tB("methodSimulated")
        : tB("methodOnline");
  const back = r.viewer_is_customer ? `/account/bookings/${r.booking.id}` : `/vendor/bookings/${r.booking.id}`;

  const row = (label: string, value: React.ReactNode, testId?: string) => (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1.5 text-sm print:grid-cols-[9rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd data-testid={testId}>{value}</dd>
    </div>
  );

  return (
    <main className="bg-background min-h-dvh px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto grid max-w-2xl gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Link
            href={back}
            className="text-primary inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t("back")}
          </Link>
          <PrintButton label={t("print")} />
        </div>

        <article className="bg-card grid gap-6 rounded-lg border p-6 shadow-sm sm:p-8 print:border-0 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
            <div className="grid gap-1">
              <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
              <p className="font-mono text-sm" data-testid="receipt-number">
                {r.receipt_number}
              </p>
              <p className="text-muted-foreground text-sm">{formatDateTime(r.paid_at, locale)}</p>
            </div>
            <div className="grid gap-0.5 text-right text-sm">
              <p className="font-semibold">{r.vendor.name}</p>
              {r.vendor.legal_name && r.vendor.legal_name !== r.vendor.name ? <p>{r.vendor.legal_name}</p> : null}
              {r.vendor.address ? <p className="text-muted-foreground">{r.vendor.address}</p> : null}
              {r.vendor.phone ? <p className="text-muted-foreground">{r.vendor.phone}</p> : null}
              {r.vendor.email ? <p className="text-muted-foreground">{r.vendor.email}</p> : null}
              {r.vendor.gstin ? <p className="text-muted-foreground">GSTIN {r.vendor.gstin}</p> : null}
            </div>
          </header>

          <section className="grid gap-1">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">{t("receivedFrom")}</p>
            <p className="font-medium">{r.customer.name ?? "—"}</p>
            <p className="text-muted-foreground text-sm">
              {[r.customer.phone, r.customer.email].filter(Boolean).join(" · ")}
            </p>
          </section>

          <section className="bg-accent/50 grid gap-1 rounded-md p-4">
            <p className="text-muted-foreground text-xs">{t("amountReceived")}</p>
            <p className="text-3xl font-semibold tabular-nums" data-testid="receipt-amount">
              {money(r.amount_paise)}
            </p>
            {r.currency === "INR" ? <p className="text-sm italic">{amountInWordsINR(r.amount_paise)}</p> : null}
          </section>

          <dl className="divide-y">
            {row(t("towards"), `${r.booking.listing ?? "—"} · ${tB(`kinds.${r.kind}`)}`)}
            {row(
              t("eventDate"),
              range
                ? `${formatDateTime(range.start, locale)} – ${formatDateTime(range.end, locale, undefined, { timeStyle: "short" })}`
                : r.booking.event_date,
            )}
            {row(t("method"), method)}
            {r.reference ? row(t("reference"), r.reference) : null}
            {r.gateway_payment_id && !r.gateway_payment_id.startsWith("pay_sim_")
              ? row(t("gatewayId"), <span className="font-mono text-xs">{r.gateway_payment_id}</span>)
              : null}
            {row(t("bookingTotal"), money(r.booking.total_paise))}
            {row(t("paidToDate"), money(r.booking.paid_to_date_paise))}
            {row(t("balance"), money(r.booking.balance_after_paise), "receipt-balance")}
            {r.refunded_paise > 0 ? row(t("refunded"), money(r.refunded_paise)) : null}
          </dl>

          <footer className="text-muted-foreground grid gap-1 border-t pt-4 text-xs">
            <p>{t("notInvoice")}</p>
            <p>{t("issuedVia", { site: siteConfig.name })}</p>
          </footer>
        </article>
      </div>
    </main>
  );
}
