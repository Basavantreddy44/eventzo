import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { localeFrom } from "@/i18n/params";
import type { AppLocale } from "@/i18n/routing";
import { BusinessProfileForm } from "@/features/vendor/components/business-profile-form";
import { loadVendorPage } from "@/features/vendor/lib/page";
import { getBusinessProfile } from "@/features/vendor/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/profile">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendor.profile" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VendorProfilePage({ params }: PageProps<"/[locale]/vendor/profile">) {
  const { ctx } = await loadVendorPage(params, "/vendor/profile");
  if (!ctx) return null;
  const [t, tVendor, data] = await Promise.all([
    getTranslations("vendor.profile"),
    getTranslations("vendor"),
    getBusinessProfile(ctx.membership.organization_id),
  ]);
  const isOwner = ctx.membership.role === "owner";
  const p = data.profile;

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {!isOwner ? <p className="text-muted-foreground text-sm">{tVendor("ownerOnly")}</p> : null}
      <Card>
        <CardContent>
          <BusinessProfileForm
            readOnly={!isOwner}
            defaults={{
              name: data.organization.name,
              legalName: data.organization.legal_name ?? "",
              displayName: p?.display_name ?? "",
              tagline: p?.tagline ?? "",
              description: p?.description ?? "",
              yearEstablished: p?.year_established ? String(p.year_established) : "",
              gstin: p?.gstin ?? "",
              pan: p?.pan ?? "",
              contactEmail: p?.contact_email ?? "",
              contactPhone: p?.contact_phone ?? "",
              whatsappPhone: p?.whatsapp_phone ?? "",
              website: p?.website ?? "",
              languages: (p?.languages?.length ? p.languages : ["en"]) as AppLocale[],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
