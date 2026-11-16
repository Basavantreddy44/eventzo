import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Read-only star row; `label` is the accessible text ("4 out of 5"). */
export function Stars({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn("size-4", n <= Math.round(value) ? "fill-gold text-gold" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}
