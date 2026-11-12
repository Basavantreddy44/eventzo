import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/** Copies `{ field: i18nKey }` errors returned by a Server Action into RHF. */
export function applyServerFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: Record<string, string> | undefined,
) {
  if (!fieldErrors) return;
  for (const [field, message] of Object.entries(fieldErrors)) {
    if (field === "_form") continue;
    setError(field as Path<T>, { type: "server", message });
  }
}
