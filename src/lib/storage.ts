export const LISTING_MEDIA_BUCKET = "listing-media";

/** Public URL of an object in the public `listing-media` bucket. */
export function listingMediaUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${LISTING_MEDIA_BUCKET}/${encoded}`;
}
