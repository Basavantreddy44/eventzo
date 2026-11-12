import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FileText, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { DeleteRowButton } from "@/components/delete-row-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { deleteDocument, getDocumentUrl } from "@/features/vendor/actions/documents";
import { DocumentUploadForm, OpenDocumentButton } from "@/features/vendor/components/document-upload-form";
import { loadVendorPage } from "@/features/vendor/lib/page";
import { getBusinessProfile, getDocuments } from "@/features/vendor/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/vendor/documents">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "vendor.documents" });
  return { title: t("title"), robots: { index: false } };
}

export default async function VendorDocumentsPage({ params }: PageProps<"/[locale]/vendor/documents">) {
  const { locale, ctx } = await loadVendorPage(params, "/vendor/documents");
  if (!ctx) return null;
  const [t, tVendor] = await Promise.all([getTranslations("vendor.documents"), getTranslations("vendor")]);

  if (ctx.membership.role !== "owner") {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <Card>
          <CardContent>{tVendor("ownerOnly")}</CardContent>
        </Card>
      </div>
    );
  }

  const orgId = ctx.membership.organization_id;
  const [docs, { organization }] = await Promise.all([getDocuments(orgId), getBusinessProfile(orgId)]);
  type Doc = (typeof docs)[number];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <ShieldCheck className="text-gold size-4" aria-hidden />
            {t("verification")} <StatusBadge status={organization.verification_status} />
          </span>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-2">
          <DataTable<Doc>
            rows={docs}
            rowKey={(d) => d.id}
            caption={t("title")}
            empty={<EmptyState icon={FileText} title={t("empty")} />}
            columns={[
              {
                key: "type",
                header: t("colType"),
                cell: (d) => (
                  <div className="grid gap-0.5">
                    <span className="font-medium">{t(`types.${d.document_type}`)}</span>
                    {d.status === "rejected" && d.rejection_reason ? (
                      <span className="text-destructive text-xs">
                        {t("rejectedReason", { reason: d.rejection_reason })}
                      </span>
                    ) : null}
                  </div>
                ),
              },
              {
                key: "file",
                header: t("colFile"),
                cell: (d) => <span className="text-sm break-all">{d.file_name}</span>,
                hideOnMobile: true,
              },
              { key: "status", header: t("colStatus"), cell: (d) => <StatusBadge status={d.status} /> },
              {
                key: "uploaded",
                header: t("colUploaded"),
                cell: (d) => formatDateTime(d.created_at, locale, undefined, { dateStyle: "medium" }),
                hideOnMobile: true,
              },
              {
                key: "actions",
                header: "",
                className: "text-right",
                cell: (d) => (
                  <div className="flex justify-end gap-1">
                    <OpenDocumentButton
                      label={t("view")}
                      failedLabel={t("openFailed")}
                      getUrl={getDocumentUrl.bind(null, d.id)}
                    />
                    {d.status === "uploaded" ? (
                      <DeleteRowButton
                        action={deleteDocument.bind(null, d.id)}
                        label={t("delete")}
                        title={t("deleteTitle")}
                        description={t("deleteBody")}
                        successMessage={t("deleted")}
                      />
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
          <p className="text-muted-foreground text-xs">{t("privacy")}</p>
        </div>
        <Card className="content-start">
          <CardHeader>
            <CardTitle>{t("upload")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentUploadForm organizationId={orgId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
