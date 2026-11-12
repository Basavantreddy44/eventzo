import { getTranslations } from "next-intl/server";
import { PortalShell } from "@/components/layout/portal-shell";
import type { NavItem } from "@/components/layout/nav-icons";
import { AccessDenied } from "@/components/states/access-denied";
import { requireUser } from "@/lib/auth/session";
import { vendorMemberships } from "@/lib/auth/permissions";
import { getUserMenuProps, localizedPath } from "@/lib/auth/portal-user";
import { WorkspaceSwitcher } from "@/features/organizations/components/workspace-switcher";
import { getVendorContext } from "@/features/organizations/queries/vendor-context";
import { localeFrom } from "@/i18n/params";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function VendorLayout({ children, params }: LayoutProps<"/[locale]/vendor">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/vendor"));
  const t = await getTranslations();

  const ctx = await getVendorContext();
  if (!ctx) {
    return (
      <AccessDenied
        description={t("errors.accessDeniedVendor")}
        action={{ href: "/become-a-vendor", label: t("home.vendorCtaButton") }}
      />
    );
  }

  const isStaff = ctx.membership.role === "staff";
  const manager = (items: NavItem[]) => (isStaff ? [] : items);
  const nav: NavItem[] = [
    { href: "/vendor", label: t("nav.dashboard"), icon: "dashboard", exact: true },
    { href: "/vendor/jobs", label: t("nav.myJobs"), icon: "jobs" },
    ...manager([{ href: "/vendor/schedule", label: t("nav.schedule"), icon: "schedule" }]),
    { href: "/vendor/enquiries", label: t("nav.enquiries"), icon: "enquiries" },
    { href: "/vendor/calendar", label: t("nav.calendar"), icon: "calendar" },
    { href: "/vendor/listings", label: t("nav.listings"), icon: "services" },
    { href: "/vendor/resources", label: t("nav.resources"), icon: "resources" },
    { href: "/vendor/branches", label: t("nav.branches"), icon: "branches" },
    { href: "/vendor/team", label: t("nav.team"), icon: "team" },
    ...manager([{ href: "/vendor/staff", label: t("nav.staff"), icon: "staff" }]),
    { href: "/vendor/profile", label: t("nav.businessProfile"), icon: "settings" },
    { href: "/vendor/documents", label: t("nav.documents"), icon: "verification" },
    { href: "/vendor/bookings", label: t("nav.bookings"), icon: "bookings" },
    ...manager([
      { href: "/vendor/finance", label: t("nav.finance"), icon: "finance" },
      { href: "/vendor/reports", label: t("nav.reports"), icon: "reports" },
    ]),
  ];

  return (
    <PortalShell
      area={t("nav.vendor")}
      homeHref="/vendor"
      nav={nav}
      user={await getUserMenuProps(user)}
      switcher={
        <WorkspaceSwitcher
          organizations={vendorMemberships(user.access).map((m) => ({
            id: m.organization_id,
            label: m.organization_name,
          }))}
          activeOrganizationId={ctx.membership.organization_id}
          branches={ctx.branches.map((b) => ({ id: b.id, label: b.name }))}
          activeBranchId={ctx.activeBranchId}
          canSelectAllBranches={ctx.membership.role === "owner"}
        />
      }
    >
      {ctx.membership.organization_status === "suspended" || ctx.membership.organization_status === "closed" ? (
        <SuspendedBanner organizationId={ctx.membership.organization_id} status={ctx.membership.organization_status} />
      ) : null}
      {children}
    </PortalShell>
  );
}

/** Tells the team why the business is hidden; bookings keep working (product decision, Phase 8). */
async function SuspendedBanner({ organizationId, status }: { organizationId: string; status: string }) {
  const t = await getTranslations("vendor.suspension");
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("status_reason").eq("id", organizationId).maybeSingle();
  return (
    <div
      role="status"
      className="border-destructive/40 bg-destructive/5 mb-6 grid gap-1 rounded-md border px-4 py-3 text-sm"
      data-testid="suspended-banner"
    >
      <p className="font-medium">{status === "closed" ? t("closedTitle") : t("suspendedTitle")}</p>
      {data?.status_reason ? <p>{t("reason", { reason: data.status_reason })}</p> : null}
      <p className="text-muted-foreground">{t("body")}</p>
    </div>
  );
}
