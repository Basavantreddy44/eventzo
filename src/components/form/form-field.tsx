"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type DynamicT = { (key: string): string; has(key: string): boolean };

/**
 * Label + control + hint + translated error. `error` is an i18n key such as
 * "validation.email" (what our Zod schemas emit).
 */
export function FormField({
  id,
  label,
  hint,
  error,
  optionalLabel,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optionalLabel?: string;
  className?: string;
  children: React.ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
}) {
  // Keys arrive at runtime (from Zod / Server Actions), so use an untyped view of t.
  const t = useTranslations() as unknown as DynamicT;
  // Next keeps recently visited pages mounted (hidden), so two forms with an
  // "email" field can coexist; a label pointing at a shared id would focus the
  // hidden one (QA B9). Suffix every DOM id with a per-instance useId().
  const domId = `${id}-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hintId = hint ? `${domId}-hint` : undefined;
  const errorId = error ? `${domId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={domId}>
        {label}
        {optionalLabel ? <span className="text-muted-foreground font-normal">({optionalLabel})</span> : null}
      </Label>
      {React.cloneElement(children, {
        id: domId,
        "aria-invalid": !!error || undefined,
        "aria-describedby": describedBy,
      })}
      {hint && !error ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-xs font-medium">
          {t.has(error) ? t(error) : t("validation.invalid")}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level error banner (translated i18n key). */
export function FormError({ message }: { message?: string | null }) {
  // Keys arrive at runtime (from Zod / Server Actions), so use an untyped view of t.
  const t = useTranslations() as unknown as DynamicT;
  if (!message) return null;
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
    >
      {t.has(message) ? t(message) : t("errors.unknown")}
    </div>
  );
}
