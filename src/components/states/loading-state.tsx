import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Generic page-level skeleton: header line + a grid of cards + a table block. */
export function LoadingState({ label, className, cards = 3 }: { label: string; className?: string; cards?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn("grid gap-6", className)}>
      <span className="sr-only">{label}</span>
      <div className="grid gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}
