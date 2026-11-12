import { z } from "zod";
import { routing } from "@/i18n/routing";

const E164 = /^\+[1-9][0-9]{7,14}$/;

/**
 * Normalises common Indian mobile formats to E.164:
 *   "98450 12345" | "098450-12345" | "91 9845012345" | "+91 98450 12345" → "+919845012345"
 * Returns null when the result is not a plausible E.164 number.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, "");
  let candidate = compact;
  if (/^[6-9]\d{9}$/.test(compact)) candidate = `+91${compact}`;
  else if (/^0[6-9]\d{9}$/.test(compact)) candidate = `+91${compact.slice(1)}`;
  else if (/^91[6-9]\d{9}$/.test(compact)) candidate = `+${compact}`;
  else if (/^00[1-9]\d{7,14}$/.test(compact)) candidate = `+${compact.slice(2)}`;
  return E164.test(candidate) ? candidate : null;
}

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "validation.nameLength").max(120, "validation.nameLength"),
  displayName: z.string().trim().max(60, "validation.displayNameLength"),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || normalizePhone(v) !== null, "validation.phone"),
  preferredLocale: z.enum(routing.locales),
});
export type ProfileInput = z.infer<typeof profileSchema>;
