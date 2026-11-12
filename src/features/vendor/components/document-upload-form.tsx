"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form/form-field";
import { createClient } from "@/lib/supabase/client";
import { registerDocument } from "../actions/documents";
import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES, DOCUMENT_TYPES, extensionFor } from "../schemas";

/**
 * Uploads straight from the browser to the private `business-documents`
 * bucket (storage RLS: owners write only into their org folder), then the
 * server records it after re-checking the path.
 */
export function DocumentUploadForm({ organizationId }: { organizationId: string }) {
  const t = useTranslations("vendor.documents");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<(typeof DOCUMENT_TYPES)[number]>("gst_certificate");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("validation.file");
    if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) return setError("validation.fileType");
    if (file.size > DOCUMENT_MAX_BYTES) return setError("validation.fileSize");

    startTransition(async () => {
      const path = `${organizationId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("business-documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) return setError("vendor.documents.uploadFailed");

      const result = await registerDocument({
        documentType: type,
        storagePath: path,
        fileName: file.name.slice(0, 200),
        mimeType: file.type as (typeof DOCUMENT_MIME_TYPES)[number],
        sizeBytes: file.size,
      });
      if (!result.ok) return setError(result.error);

      toast.success(t("uploaded"));
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("upload")}>
      <FormError message={error} />
      <div className="grid gap-2">
        <Label htmlFor="doc-type">{t("type")}</Label>
        <NativeSelect id="doc-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          {DOCUMENT_TYPES.map((d) => (
            <option key={d} value={d}>
              {t(`types.${d}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="doc-file">{t("file")}</Label>
        <Input
          id="doc-file"
          ref={fileRef}
          type="file"
          accept={DOCUMENT_MIME_TYPES.join(",")}
          aria-describedby="doc-file-hint"
        />
        <p id="doc-file-hint" className="text-muted-foreground text-xs">
          {t("fileHint")}
        </p>
      </div>
      <Button type="submit" disabled={pending} className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
        {pending ? t("uploading") : t("upload")}
      </Button>
    </form>
  );
}

/** "View" button: fetches a 2-minute signed link and opens it. */
export function OpenDocumentButton({
  label,
  failedLabel,
  getUrl,
}: {
  label: string;
  failedLabel: string;
  getUrl: () => Promise<{ ok: true; data: string } | { ok: false; error: string }>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await getUrl();
          if (result.ok) window.open(result.data, "_blank", "noopener,noreferrer");
          else toast.error(failedLabel);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {label}
    </Button>
  );
}
