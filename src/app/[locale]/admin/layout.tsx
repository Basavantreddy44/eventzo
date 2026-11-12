import { getTranslations } from "next-intl/server";
import { PortalShell } from "@/components/layout/portal-shell";
import type { NavItem } from "@/components/layout/nav-icons";
import { AccessDenied } from "@/components/states/access-denied";
import { requireUser } from "@/lib/auth/session";
import { hasPermission, isPlatformAdmin } from "@/lib/auth/permissions";
import { getUserMenuProps, localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";

export const instant = false;

export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/admin"));
  const t = await getTranslations();

  if (!isPlatformAdmin(user.access)) {
    return <AccessDenied description={t("errors.accessDeniedAdmin")} />;
  }

  const can = (permission: string) => hasPermission(user.access, permission);
  const items: (NavItem & { permission: string })[] = [
    { href: "/admin", label: t("nav.dashboard"), icon: "dashboard", exact: true, permission: "admin.access" },
    { href: "/admin/vendors", label: t("nav.organizations"), icon: "branches", permission: "organizations.read" },
    {
      href: "/admin/verification",
      label: t("nav.verification"),
      icon: "verification",
      permission: "verification.manage",
    },
    { href: "/admin/users", label: t("nav.users"), icon: "team", permission: "users.read" },
    { href: "/admin/taxonomy", label: t("nav.taxonomy"), icon: "taxonomy", permission: "taxonomy.manage" },
    { href: "/admin/muhurtham", label: t("nav.muhurtham"), icon: "muhurtham", permission: "auspicious_dates.manage" },
    { href: "/admin/pricing", label: t("nav.pricing"), icon: "finance", permission: "pricing.manage" },
    { href: "/admin/payments", label: t("nav.paymentsLedger"), icon: "ledger", permission: "finance.read" },
    { href: "/admin/refunds", label: t("nav.refunds"), icon: "refunds", permission: "finance.read" },
    { href: "/admin/notifications", label: t("nav.outbox"), icon: "notifications", permission: "notifications.manage" },
    { href: "/admin/audit", label: t("nav.auditLog"), icon: "audit", permission: "audit.read" },
  ];
  // Only what this role can open (the pages check again; RLS is the real gate).
  const nav: NavItem[] = items
    .filter((i) => can(i.permission))
    .map((i) => ({ href: i.href, label: i.label, icon: i.icon, exact: i.exact }));

  return (
    <PortalShell area={t("nav.admin")} homeHref="/admin" nav={nav} user={await getUserMenuProps(user)}>
      {children}
    </PortalShell>
  );
}
