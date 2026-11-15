"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { useTranslations } from "next-intl";

type DynamicT = { (key: string): string; has(key: string): boolean };

/**
 * A required "I agree to …" tick with links to the policies (Roadmap A8).
 * The accepted policy versions are recorded server-side in consent_records.
 */
export function ConsentCheckbox({
  label,
  error,
  ...input
}: { label: ReactNode; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `consent-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const t = useTranslations() as unknown as DynamicT;
  return (
    <div className="grid gap-1">
      <div className="flex items-start gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          className="accent-primary mt-0.5 size-4 shrink-0"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...input}
        />
        <label htmlFor={id} className="leading-snug">
          {label}
        </label>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-xs font-medium">
          {t.has(error) ? t(error) : t("validation.invalid")}
        </p>
      ) : null}
    </div>
  );
}
