import { z } from "zod";
import { routing } from "@/i18n/routing";

/**
 * Validation messages are i18n keys (resolved with `t()` in the UI), so the
 * same schema validates on the client (React Hook Form) and the server
 * (Server Actions).
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "validation.required")
  .pipe(z.email("validation.email"));

/** Mirrors supabase/config.toml: ≥ 8 chars, letters + digits. bcrypt caps at 72 bytes. */
export const passwordSchema = z
  .string()
  .min(8, "validation.passwordMin")
  .max(72, "validation.passwordMax")
  .regex(/[A-Za-z]/, "validation.passwordLettersDigits")
  .regex(/[0-9]/, "validation.passwordLettersDigits");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "validation.required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const magicLinkSchema = z.object({ email: emailSchema });
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "validation.nameLength").max(120, "validation.nameLength"),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "validation.required"),
    locale: z.enum(routing.locales).default(routing.defaultLocale),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "validation.passwordsMismatch",
  });
export type RegisterInput = z.input<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "validation.required"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "validation.passwordsMismatch",
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Flattens Zod issues into { field: i18nKey } for form display. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message.startsWith("validation.") ? issue.message : "validation.invalid";
  }
  return out;
}
