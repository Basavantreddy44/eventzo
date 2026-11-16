import { z } from "zod";

export const REVIEW_MAX_PHOTOS = 4;
export const REVIEW_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** {user_id}/{uuid}.{ext}: the database checks the folder is the reviewer's own. */
export const reviewPhotoPath = z
  .string()
  .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/, "validation.invalid");

export const reviewSchema = z.object({
  itemId: z.uuid(),
  rating: z.number().int().min(1, "reviews.ratingRequired").max(5, "reviews.ratingRequired"),
  body: z.string().trim().min(10, "reviews.bodyTooShort").max(2000, "validation.tooLong"),
  photos: z.array(reviewPhotoPath).max(REVIEW_MAX_PHOTOS, "reviews.photosLimit"),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const replySchema = z.object({
  reviewId: z.uuid(),
  reply: z.string().trim().min(1, "validation.required").max(1000, "validation.tooLong"),
});
export type ReplyInput = z.infer<typeof replySchema>;

export const moderateSchema = z
  .object({
    reviewId: z.uuid(),
    status: z.enum(["published", "hidden"]),
    reason: z.string().trim().max(500, "validation.tooLong").optional(),
  })
  .refine((v) => v.status === "published" || !!v.reason, { path: ["reason"], message: "reviews.reasonRequired" });
export type ModerateInput = z.infer<typeof moderateSchema>;

/** A booking can be reviewed once it is confirmed and its event day has passed (India time). */
export function canReview(item: { status: string; event_date: string }, today: string): boolean {
  return item.status === "confirmed" && item.event_date < today;
}

export function photoExtension(mime: string): string | null {
  return mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : null;
}
