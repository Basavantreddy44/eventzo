import { getTranslations } from "next-intl/server";
import { PortalShell } from "@/components/layout/portal-shell";
import type { NavItem } from "@/components/layout/nav-icons";
import { requireUser } from "@/lib/auth/session";
import { getUserMenuProps, localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";

// Auth-gated: render on the server per request rather than as an instant shell.
export const instant = false;

export default async function AccountLayout({ children, params }: LayoutProps<"/[locale]/account">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/account"));
  const t = await getTranslations();

  const nav: NavItem[] = [
    { href: "/account", label: t("nav.profile"), icon: "profile", exact: true },
    { href: "/account/enquiries", label: t("nav.myEnquiries"), icon: "enquiries" },
    { href: "/account/events", label: t("nav.events"), icon: "events" },
    { href: "/account/bookings", label: t("nav.bookings"), icon: "bookings" },
    { href: "/account/notifications", label: t("nav.notifications"), icon: "notifications" },
  ];

  return (
    <PortalShell area={t("nav.account")} homeHref="/" nav={nav} user={await getUserMenuProps(user)}>
      {children}
    </PortalShell>
  );
}
