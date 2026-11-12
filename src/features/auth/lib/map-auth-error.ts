/** Maps Supabase Auth error codes to i18n keys under `auth.errors.*`. */
export type AuthErrorKey =
  | "auth.errors.invalidCredentials"
  | "auth.errors.emailNotConfirmed"
  | "auth.errors.emailTaken"
  | "auth.errors.weakPassword"
  | "auth.errors.rateLimited"
  | "auth.errors.linkInvalid"
  | "auth.errors.sessionMissing"
  | "auth.errors.blocked"
  | "auth.errors.generic";

export function mapAuthError(error: { code?: string; status?: number } | null | undefined): AuthErrorKey {
  switch (error?.code) {
    case "invalid_credentials":
      return "auth.errors.invalidCredentials";
    case "email_not_confirmed":
      return "auth.errors.emailNotConfirmed";
    case "user_already_exists":
    case "email_exists":
      return "auth.errors.emailTaken";
    case "weak_password":
      return "auth.errors.weakPassword";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "too_many_requests":
      return "auth.errors.rateLimited";
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
      return "auth.errors.linkInvalid";
    case "user_banned":
      return "auth.errors.blocked";
    case "session_not_found":
    case "session_expired":
      return "auth.errors.sessionMissing";
  }
  if (error?.status === 429) return "auth.errors.rateLimited";
  return "auth.errors.generic";
}
