export const LISTING_MEDIA_BUCKET = "listing-media";
export const REVIEW_PHOTOS_BUCKET = "review-photos";

/** Public URL of an object in a public bucket. */
export function publicObjectUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`;
}

/** Public URL of an object in the public `listing-media` bucket. */
export function listingMediaUrl(path: string): string {
  return publicObjectUrl(LISTING_MEDIA_BUCKET, path);
}

/** Public URL of a customer review photo. */
export function reviewPhotoUrl(path: string): string {
  return publicObjectUrl(REVIEW_PHOTOS_BUCKET, path);
}
