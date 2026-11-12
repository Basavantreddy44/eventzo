import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { localeFrom } from "@/i18n/params";
import { getBranches, getBusinessProfile } from "@/features/vendor/queries";
import { ListingForm } from "@/features/vendor/components/listing-form";
import { emptyListing } from "@/features/vendor/lib/listing-defaults";
import { getListingFormOptions } from "@/features/vendor/lib/listing-options";
import { loadVendorPage } from "@/features/vendor/lib/page";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/listings/new">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendor.listings" });
  return { title: t("formTitleNew"), robots: { index: false } };
}

export default async function NewListingPage({ params }: PageProps<"/[locale]/vendor/listings/new">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/listings/new");
  if (!ctx) return null;
  const [t, tVendor] = await Promise.all([getTranslations("vendor.listings"), getTranslations("vendor")]);
  if (ctx.membership.role === "staff") {
    return <p className="text-muted-foreground text-sm">{tVendor("ownerOnly")}</p>;
  }

  const orgId = ctx.membership.organization_id;
  const [options, { organization }, branches] = await Promise.all([
    getListingFormOptions(ctx, locale),
    getBusinessProfile(orgId),
    getBranches(orgId),
  ]);
  // Sensible defaults: the active branch (managers: their first branch) and its city.
  const branchId = ctx.activeBranchId ?? (ctx.membership.role === "branch_manager" ? (ctx.branches[0]?.id ?? "") : "");
  const branch = branches.find((b) => b.id === branchId) ?? branches.find((b) => b.is_primary) ?? branches[0];

  return (
    <div className="grid gap-6">
      <Link
        href="/vendor/listings"
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={t("formTitleNew")} description={organization.name} />
      <Card>
        <CardContent>
          <ListingForm initial={emptyListing({ cityId: branch?.city_id ?? "", branchId })} {...options} />
        </CardContent>
      </Card>
    </div>
  );
}
