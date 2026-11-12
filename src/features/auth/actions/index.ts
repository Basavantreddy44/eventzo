"use server";

import { redirect as nextRedirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getPathname, redirect } from "@/i18n/navigation";
import { getPublicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/auth/paths";
import { fail, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { mapAuthError } from "../lib/map-auth-error";
import {
  forgotPasswordSchema,
  loginSchema,
  magicLinkSchema,
  registerSchema,
  resetPasswordSchema,
  toFieldErrors,
  type ForgotPasswordInput,
  type LoginInput,
  type MagicLinkInput,
  type RegisterInput,
  type ResetPasswordInput,
} from "../schemas";

/** Absolute callback URL that lands the user on `nextPath` after verifying. */
function callbackUrl(nextPath: string) {
  const url = new URL("/auth/callback", getPublicEnv().NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("next", nextPath);
  return url.toString();
}

async function localized(path: string) {
  const locale = await getLocale();
  return getPathname({ href: path, locale });
}

export async function signInWithPassword(input: LoginInput, next?: string | null): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return fail(mapAuthError(error));

  return nextRedirect(safeNextPath(next, await localized("/account")));
}

export async function sendMagicLink(input: MagicLinkInput, next?: string | null): Promise<ActionResult> {
  const parsed = magicLinkSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false, // sign-in only; registration collects a name and password
      emailRedirectTo: callbackUrl(safeNextPath(next, await localized("/account"))),
    },
  });
  // Unknown emails are treated like success, so the form can't be used to
  // discover which addresses have accounts. Only rate limits are surfaced.
  if (error && mapAuthError(error) === "auth.errors.rateLimited") return fail("auth.errors.rateLimited");

  return redirect({ href: "/check-email", locale: await getLocale() });
}

export async function signUp(input: RegisterInput): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));

  const { fullName, email, password, locale } = parsed.data;
  const accountPath = getPathname({ href: "/account", locale });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, preferred_locale: locale },
      emailRedirectTo: callbackUrl(accountPath),
    },
  });
  if (error) return fail(mapAuthError(error));

  // Email confirmation disabled (local dev) → we already have a session.
  if (data.session) nextRedirect(accountPath);

  // Confirmation required. (An existing email also lands here, by design,
  // to avoid revealing which addresses are registered.)
  return redirect({ href: { pathname: "/check-email", query: { mode: "signup" } }, locale });
}

export async function requestPasswordReset(input: ForgotPasswordInput): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl(await localized("/reset-password")),
  });
  if (error && mapAuthError(error) === "auth.errors.rateLimited") return fail("auth.errors.rateLimited");

  return redirect({ href: "/check-email", locale: await getLocale() });
}

export async function updatePassword(input: ResetPasswordInput): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail("auth.errors.sessionMissing");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(mapAuthError(error));

  return redirect({ href: "/account", locale: await getLocale() });
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect({ href: "/", locale: await getLocale() });
}
