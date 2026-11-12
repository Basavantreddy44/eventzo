import Image from "next/image";
import { CategoryIcon } from "@/features/taxonomy/components/category-icon";
import { listingMediaUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

/** Listing photo, or a branded placeholder with the category icon when there is none. */
export function ListingCover({
  path,
  alt,
  icon,
  className,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  priority = false,
  placeholderLabel,
}: {
  path: string | null;
  alt: string;
  icon: string | null;
  className?: string;
  sizes?: string;
  priority?: boolean;
  placeholderLabel?: string;
}) {
  return (
    <div className={cn("bg-muted relative aspect-[4/3] overflow-hidden", className)}>
      {path ? (
        <Image src={listingMediaUrl(path)} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
      ) : (
        <div
          role="img"
          aria-label={placeholderLabel ?? alt}
          className="from-primary/15 via-accent to-gold/25 flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br"
        >
          <CategoryIcon name={icon} className="text-primary/60 size-10" />
          {placeholderLabel ? <span className="text-primary/70 text-xs font-medium">{placeholderLabel}</span> : null}
        </div>
      )}
    </div>
  );
}
