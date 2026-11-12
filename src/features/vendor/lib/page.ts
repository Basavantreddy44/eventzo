import "server-only";

import { requireUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { getVendorContext } from "@/features/organizations/queries/vendor-context";

/**
 * Common start of every vendor page. Re-checks the session (layouts don't
 * re-run on every navigation). `ctx` is null when the user has no vendor
 * membership — the vendor layout then renders Access denied.
 */
export async function loadVendorPage(params: Promise<{ locale: string }>, path: string) {
  const locale = await localeFrom(params);
  await requireUser(locale, localizedPath(locale, path));
  const ctx = await getVendorContext();
  return { locale, ctx };
}
