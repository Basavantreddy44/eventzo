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
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { localizedPath } from "@/lib/auth/portal-user";
import { createClient } from "@/lib/supabase/server";
import { localeFrom } from "@/i18n/params";
import { getReviewDocumentUrl } from "@/features/vendor/actions/verification";
import { OpenDocumentButton } from "@/features/vendor/components/document-upload-form";
import { DocumentReview, VerificationDecision } from "@/features/vendor/components/verification-review";

export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/verification/[orgId]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "admin.verification" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VerificationDetailPage({ params }: PageProps<"/[locale]/admin/verification/[orgId]">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/admin/verification"));
  const { orgId } = await params;
  if (!z.uuid().safeParse(orgId).success || !hasPermission(user.access, "verification.manage")) notFound();

  const supabase = await createClient();
  const [{ data: org }, { data: profile }, { data: docs, error: docsError }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, legal_name, status, verification_status")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("business_profiles")
      .select("gstin, pan, contact_phone, contact_email, description")
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("business_documents")
      .select("id, document_type, file_name, status, rejection_reason, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
  ]);
  if (!org) notFound();
  if (docsError) throw new Error(`Failed to load documents: ${docsError.message}`);
  const [t, tDocs] = await Promise.all([getTranslations("admin.verification"), getTranslations("vendor.documents")]);

  const facts = [
    { label: t("gstin"), value: profile?.gstin },
    { label: t("pan"), value: profile?.pan },
    { label: t("phone"), value: profile?.contact_phone },
    { label: t("email"), value: profile?.contact_email },
  ];

  return (
    <div className="grid gap-6">
      <Link
        href="/admin/verification"
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={org.name}
        description={org.legal_name ?? t("detailSubtitle")}
        actions={
          <>
            <StatusBadge status={org.status} />
            <StatusBadge status={org.verification_status} />
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t("documents")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!docs?.length ? (
              <p className="text-muted-foreground text-sm">{t("noDocuments")}</p>
            ) : (
              <ul className="grid gap-3" data-testid="review-documents">
                {docs.map((d) => (
                  <li key={d.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-start">
                    <div className="grid gap-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {tDocs(`types.${d.document_type}`)} <StatusBadge status={d.status} />
                      </p>
                      <p className="text-muted-foreground text-xs break-all">
                        {d.file_name} · {formatDateTime(d.created_at, locale, undefined, { dateStyle: "medium" })}
                      </p>
                      {d.rejection_reason ? (
                        <p className="text-destructive text-xs">
                          {tDocs("rejectedReason", { reason: d.rejection_reason })}
                        </p>
                      ) : null}
                      <div>
                        <OpenDocumentButton
                          label={t("open")}
                          failedLabel={tDocs("openFailed")}
                          getUrl={getReviewDocumentUrl.bind(null, d.id)}
                        />
                      </div>
                    </div>
                    {d.status === "uploaded" || d.status === "under_review" ? (
                      <DocumentReview documentId={d.id} />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("profile")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                {facts.map((f) => (
                  <div key={f.label} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="font-medium break-all">{f.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("decision")}</CardTitle>
            </CardHeader>
            <CardContent>
              <VerificationDecision organizationId={org.id} queueHref={localizedPath(locale, "/admin/verification")} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
