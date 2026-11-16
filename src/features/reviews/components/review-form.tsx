"use client";

import { useId, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form/form-field";
import { createClient } from "@/lib/supabase/client";
import { REVIEW_PHOTOS_BUCKET, reviewPhotoUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { submitReview } from "../actions";
import {
  photoExtension,
  REVIEW_MAX_PHOTOS,
  REVIEW_PHOTO_MAX_BYTES,
  REVIEW_PHOTO_TYPES,
  reviewSchema,
} from "../schemas";

type DynamicT = { (key: string, values?: Record<string, string | number>): string; has(key: string): boolean };

/** C7: star rating, a few words and up to 4 photos, for a past booking. */
export function ReviewForm({
  itemId,
  userId,
  initial,
}: {
  itemId: string;
  userId: string;
  initial?: { rating: number; body: string; photos: string[] };
}) {
  const t = useTranslations("reviews");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [body, setBody] = useState(initial?.body ?? "");
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const [saving, startSave] = useTransition();

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const room = REVIEW_MAX_PHOTOS - photos.length;
    const chosen = [...files].slice(0, room);
    if (files.length > room) toast.error(t("photosLimit"));
    const valid = chosen.filter(
      (f) => (REVIEW_PHOTO_TYPES as readonly string[]).includes(f.type) && f.size <= REVIEW_PHOTO_MAX_BYTES,
    );
    if (valid.length < chosen.length) toast.error(t("photoFailed"));
    startUpload(async () => {
      const supabase = createClient();
      const added: string[] = [];
      for (const file of valid) {
        const path = `${userId}/${crypto.randomUUID()}.${photoExtension(file.type)}`;
        const { error } = await supabase.storage
          .from(REVIEW_PHOTOS_BUCKET)
          .upload(path, file, { contentType: file.type });
        if (error) toast.error(t("photoFailed"));
        else added.push(path);
      }
      setPhotos((p) => [...p, ...added].slice(0, REVIEW_MAX_PHOTOS));
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  const save = () => {
    const parsed = reviewSchema.safeParse({ itemId, rating, body, photos });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    startSave(async () => {
      const result = await submitReview(parsed.data);
      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) setErrors(result.fieldErrors);
        return;
      }
      setFormError(null);
      toast.success(t("thanks"));
      router.refresh();
    });
  };

  const err = (k: string) =>
    errors[k] ? (tRoot.has(errors[k]) ? tRoot(errors[k]) : tRoot("validation.invalid")) : null;

  return (
    <form
      className="grid gap-4"
      data-testid="review-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <FormError message={formError} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("ratingLabel")}</legend>
        <div className="flex gap-1" role="radiogroup" aria-label={t("ratingLabel")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={t("starsLabel", { count: n })}
              data-testid={`review-star-${n}`}
              onClick={() => setRating(n)}
              className="focus-visible:ring-ring rounded-md p-1 outline-none focus-visible:ring-[3px]"
            >
              <Star
                aria-hidden
                className={cn("size-8", n <= rating ? "fill-gold text-gold" : "text-muted-foreground/50")}
              />
            </button>
          ))}
        </div>
        {rating ? (
          <p className="text-muted-foreground text-sm">{t(`ratingWords.${rating}` as "ratingWords.5")}</p>
        ) : null}
        {err("rating") ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {err("rating")}
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-2">
        <label htmlFor={`review-body-${uid}`} className="text-sm font-medium">
          {t("bodyLabel")}
        </label>
        <textarea
          id={`review-body-${uid}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={t("bodyPlaceholder")}
          aria-invalid={!!errors.body || undefined}
          className="border-input bg-card focus-visible:border-primary focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
        />
        {err("body") ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {err("body")}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">
          {t("photosLabel")} <span className="text-muted-foreground font-normal">({t("photosHint")})</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p} className="relative size-20 overflow-hidden rounded-md border">
              <Image src={reviewPhotoUrl(p)} alt="" fill sizes="80px" className="object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((all) => all.filter((x) => x !== p))}
                aria-label={t("removePhoto")}
                className="bg-background/90 absolute top-1 right-1 rounded-full p-0.5"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
          {photos.length < REVIEW_MAX_PHOTOS ? (
            <Button
              type="button"
              variant="outline"
              className="size-20 flex-col gap-1 text-xs"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
              {t("addPhoto")}
            </Button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept={REVIEW_PHOTO_TYPES.join(",")}
          onChange={(e) => upload(e.target.files)}
          data-testid="review-photo-input"
        />
      </div>

      <Button type="submit" className="sm:justify-self-start" disabled={saving || uploading}>
        {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {initial ? t("update") : t("submit")}
      </Button>
    </form>
  );
}
