import "server-only";

import type { UserMenuProps } from "@/components/layout/user-menu";
import { getMyProfile } from "@/features/account/queries";
import { isPlatformAdmin, isVendorMember } from "./permissions";
import type { CurrentUser } from "./session";

/** Props for the header user menu, shared by every portal layout. */
export async function getUserMenuProps(user: CurrentUser): Promise<UserMenuProps> {
  const profile = await getMyProfile(user.id);
  return {
    name: profile?.display_name || profile?.full_name || user.email || "",
    email: user.email,
    showVendor: isVendorMember(user.access),
    showAdmin: isPlatformAdmin(user.access),
  };
}

/** "/account" → "/kn/account" for non-default locales. */
export function localizedPath(locale: string, path: string) {
  return locale === "en" ? path : `/${locale}${path}`;
}
