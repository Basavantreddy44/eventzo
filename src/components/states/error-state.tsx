"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Presentational error block; used by every area's error.tsx. */
export function ErrorState({
  title,
  description,
  retryLabel,
  onRetry,
  digest,
  className,
  children,
}: {
  title: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  digest?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/20 bg-card flex flex-col items-center justify-center gap-4 rounded-lg border px-6 py-12 text-center",
        className,
      )}
    >
      <span className="bg-destructive/10 text-destructive flex size-11 items-center justify-center rounded-full">
        <AlertTriangle className="size-5" aria-hidden />
      </span>
      <div className="grid max-w-md gap-1">
        <p className="text-lg font-semibold">{title}</p>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        {digest ? <p className="text-muted-foreground font-mono text-xs">Ref: {digest}</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry && retryLabel ? (
          <Button onClick={onRetry}>
            <RotateCcw aria-hidden />
            {retryLabel}
          </Button>
        ) : null}
        {children}
      </div>
    </div>
  );
}
