import "server-only";

import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";

/**
 * Common start of an admin page: re-checks the session and the page's
 * platform permission (the admin layout only checks admin.access). RLS and the
 * admin_* functions check again underneath.
 */
export async function loadAdminPage(params: Promise<{ locale: string }>, path: string, permission: string) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, path));
  return { locale, user, allowed: hasPermission(user.access, permission) };
}
