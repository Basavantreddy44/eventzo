/**
 * Maps Postgres / PostgREST error codes (raised by RLS, constraints and our
 * RPC functions) to stable, translatable error keys under `errors.*`.
 */
export type ErrorKey =
  "unauthenticated" | "forbidden" | "conflict" | "invalidInput" | "limitReached" | "notFound" | "unknown";

export function mapDbError(error: { code?: string | null } | null | undefined): ErrorKey {
  switch (error?.code) {
    case "42501": // insufficient_privilege (RLS / grants / our RPC checks)
      return "forbidden";
    case "23P01": // exclusion_violation (double booking / capacity)
      return "conflict";
    case "22023": // invalid_parameter_value (RPC validation)
    case "23514": // check_violation
    case "23502": // not_null_violation
    case "22P02": // invalid_text_representation
    case "23503": // foreign_key_violation
      return "invalidInput";
    case "54000": // program_limit_exceeded (our abuse guards)
      return "limitReached";
    case "P0002": // no_data_found
    case "PGRST116": // PostgREST: no rows for .single()
      return "notFound";
    default:
      return "unknown";
  }
}

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}
