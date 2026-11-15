import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileWarning } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { routing } from "@/i18n/routing";
import { PolicyMarkdown } from "@/features/legal/components/policy-markdown";
import { isDraftVersion, isLegalSlug, LEGAL_PAGES } from "@/features/legal/lib/policies";
import { getCurrentPolicy } from "@/features/legal/queries";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => Object.keys(LEGAL_PAGES).map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/legal/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const locale = await localeFrom(params);
  if (!isLegalSlug(slug)) return {};
  const policy = await getCurrentPolicy(LEGAL_PAGES[slug], locale);
  return { title: policy?.title };
}

/** Terms, Privacy, Refund & Cancellation and Vendor Agreement (Roadmap A8). */
export default async function LegalPage({ params }: PageProps<"/[locale]/legal/[slug]">) {
  const { slug } = await params;
  const locale = await localeFrom(params);
  if (!isLegalSlug(slug)) notFound();
  const [t, policy] = await Promise.all([getTranslations("legal"), getCurrentPolicy(LEGAL_PAGES[slug], locale)]);
  if (!policy) notFound();

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={policy.title}
        description={t("meta", {
          version: policy.version,
          date: formatDateTime(policy.effective_from, locale, undefined, { dateStyle: "long" }),
        })}
      />
      {isDraftVersion(policy.version) ? (
        <p
          role="note"
          className="border-gold/40 bg-accent/40 flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
          data-testid="policy-draft"
        >
          <FileWarning className="text-gold mt-0.5 size-4 shrink-0" aria-hidden />
          {t("draftNotice")}
        </p>
      ) : null}
      {policy.locale !== locale ? <p className="text-muted-foreground text-xs">{t("englishOnly")}</p> : null}
      <article>
        <PolicyMarkdown source={policy.body_md} />
      </article>
    </div>
  );
}
