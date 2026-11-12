import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { localeFrom } from "@/i18n/params";
import { setListingStatus } from "@/features/vendor/actions/listings";
import { ListingForm } from "@/features/vendor/components/listing-form";
import { PhotoManager } from "@/features/vendor/components/photo-manager";
import { listingToInput } from "@/features/vendor/lib/listing-defaults";
import { getListingFormOptions } from "@/features/vendor/lib/listing-options";
import { loadVendorPage } from "@/features/vendor/lib/page";
import { getListingForEdit } from "@/features/vendor/queries";
import { SERVICE_STATUS_TRANSITIONS } from "@/features/vendor/schemas";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/listings/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendor.listings" });
  return { title: t("formTitleEdit"), robots: { index: false } };
}

const ACTION_LABEL = { published: "publish", paused: "pause", archived: "archive", draft: "publish" } as const;

export default async function EditListingPage({ params }: PageProps<"/[locale]/vendor/listings/[id]">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/listings");
  if (!ctx) return null;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const listing = await getListingForEdit(ctx.membership.organization_id, id);
  if (!listing) notFound();
  const [t, options] = await Promise.all([getTranslations("vendor.listings"), getListingFormOptions(ctx, locale)]);
  const canEdit = ctx.membership.role !== "staff";
  const photos = [...(listing.service_media ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const transitions = SERVICE_STATUS_TRANSITIONS[listing.status].filter((s) => s !== "draft");

  return (
    <div className="grid gap-6">
      <Link
        href="/vendor/listings"
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={listing.title}
        actions={
          <>
            <StatusBadge status={listing.status} />
            {listing.status === "published" ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/listings/${listing.slug}`} target="_blank">
                  <ExternalLink aria-hidden />
                  {t("viewPublic")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0">
          <CardContent>
            {canEdit ? (
              <ListingForm initial={listingToInput(listing)} {...options} />
            ) : (
              <p className="text-muted-foreground text-sm">{(await getTranslations("vendor"))("ownerOnly")}</p>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          {canEdit ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("sectionStatus")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="flex flex-wrap gap-2">
                  {transitions.map((next) => (
                    <ActionButton
                      key={next}
                      action={setListingStatus.bind(null, listing.id, next)}
                      label={t(ACTION_LABEL[next])}
                      successMessage={t("statusChanged")}
                      variant={next === "published" ? "default" : "outline"}
                      testId={`listing-${next}`}
                    />
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">{t("publishHint")}</p>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t("sectionPhotos")}</CardTitle>
            </CardHeader>
            <CardContent>
              {canEdit ? (
                <PhotoManager
                  serviceId={listing.id}
                  organizationId={ctx.membership.organization_id}
                  photos={photos}
                  title={listing.title}
                />
              ) : (
                <p className="text-muted-foreground text-sm">{t("photosEmpty")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
