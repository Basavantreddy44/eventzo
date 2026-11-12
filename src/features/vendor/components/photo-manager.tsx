"use client";

import { useRef, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { listingMediaUrl } from "@/lib/storage";
import { deletePhoto, registerPhotos, setCoverPhoto } from "../actions/listings";
import { extensionFor, MAX_PHOTOS, PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from "../schemas";

type Photo = { id: string; storage_path: string; is_cover: boolean };
type DynamicT = (key: string) => string;

/** Upload (browser → public listing-media bucket), choose cover, remove. */
export function PhotoManager({
  serviceId,
  organizationId,
  photos,
  title,
}: {
  serviceId: string;
  organizationId: string;
  photos: Photo[];
  title: string;
}) {
  const t = useTranslations("vendor.listings");
  const tRoot = useTranslations() as unknown as DynamicT;
  const tListing = useTranslations("listing");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const remaining = MAX_PHOTOS - photos.length;

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const chosen = [...files].slice(0, remaining);
    if (files.length > remaining) toast.error(t("photosLimit"));
    const valid = chosen.filter(
      (f) => (PHOTO_MIME_TYPES as readonly string[]).includes(f.type) && f.size <= PHOTO_MAX_BYTES,
    );
    if (valid.length < chosen.length) toast.error(t("photoFailed"));
    if (valid.length === 0) return;

    startTransition(async () => {
      const supabase = createClient();
      const uploaded: string[] = [];
      for (const file of valid) {
        const path = `${organizationId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
        const { error } = await supabase.storage.from("listing-media").upload(path, file, { contentType: file.type });
        if (!error) uploaded.push(path);
      }
      if (uploaded.length < valid.length) toast.error(t("photoFailed"));
      if (uploaded.length > 0) {
        const result = await registerPhotos(serviceId, uploaded);
        if (result.ok) toast.success(t("photosUploaded"));
        else toast.error(tRoot(result.error));
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(success);
      else toast.error(tRoot(result.error ?? "errors.unknown"));
      router.refresh();
    });

  return (
    <div className="grid gap-4">
      {photos.length === 0 ? <p className="text-muted-foreground text-sm">{t("photosEmpty")}</p> : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="listing-photos">
        {photos.map((p, i) => (
          <li key={p.id} className="bg-muted relative overflow-hidden rounded-lg border">
            <div className="relative aspect-[4/3]">
              <Image
                src={listingMediaUrl(p.storage_path)}
                alt={tListing("photoAlt", { title, n: i + 1 })}
                fill
                sizes="(min-width: 640px) 33vw, 50vw"
                className="object-cover"
              />
            </div>
            {p.is_cover ? (
              <Badge variant="gold" className="absolute top-2 left-2">
                <Star aria-hidden />
                {t("cover")}
              </Badge>
            ) : null}
            <div className="flex justify-between gap-1 p-1">
              {!p.is_cover ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => setCoverPhoto(p.id), t("saved"))}
                >
                  {t("makeCover")}
                </Button>
              ) : (
                <span />
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={pending}
                aria-label={`${t("removePhoto")} ${i + 1}`}
                onClick={() => run(() => deletePhoto(p.id), t("photoRemoved"))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="grid gap-1">
        <input
          ref={inputRef}
          id="photo-input"
          type="file"
          multiple
          accept={PHOTO_MIME_TYPES.join(",")}
          className="sr-only"
          onChange={(e) => upload(e.target.files)}
          disabled={pending || remaining <= 0}
          data-testid="photo-input"
        />
        <Button asChild variant="outline" disabled={pending || remaining <= 0} className="sm:justify-self-start">
          <label htmlFor="photo-input" className="cursor-pointer">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
            {pending ? t("photosUploading") : t("photosAdd")}
          </label>
        </Button>
        <p className="text-muted-foreground text-xs">{remaining <= 0 ? t("photosLimit") : t("photosHint")}</p>
      </div>
    </div>
  );
}
