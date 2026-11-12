import { getTranslations } from "next-intl/server";
import { BrandLogo } from "./brand-logo";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu, type UserMenuProps } from "./user-menu";
import { getCurrentUser } from "@/lib/auth/session";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { unreadNotificationCount } from "@/features/notifications/queries";
import type { NavItem } from "./nav-icons";

/**
 * Shared shell for the account, vendor ERP and admin areas: sidebar on large
 * screens, slide-over nav on mobile (mobile-first for vendor staff, H).
 */
export async function PortalShell({
  area,
  homeHref,
  nav,
  user,
  switcher,
  children,
}: {
  area: string;
  homeHref: string;
  nav: NavItem[];
  user: UserMenuProps;
  /** Org / branch switchers (vendor ERP). */
  switcher?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = await getTranslations("common");
  const tNav = await getTranslations("nav");
  const current = await getCurrentUser();
  const unread = current ? await unreadNotificationCount(current.id) : 0;

  return (
    <div className="bg-background flex min-h-dvh">
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {tNav("skipToContent")}
      </a>

      <aside className="bg-sidebar sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r px-4 py-5 lg:flex">
        <BrandLogo href={homeHref} suffix={area} className="px-1" />
        {switcher ? <div className="grid gap-2">{switcher}</div> : null}
        <SidebarNav items={nav} label={area} soonLabel={t("comingSoon")} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/90 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-3 backdrop-blur sm:px-6">
          <MobileNav
            items={nav}
            title={area}
            openLabel={t("openMenu")}
            closeLabel={t("close")}
            soonLabel={t("comingSoon")}
            top={switcher}
          />
          <BrandLogo href={homeHref} suffix={area} className="lg:hidden" />
          <div className="ml-auto flex items-center gap-1">
            <LocaleSwitcher compact />
            {current ? (
              <NotificationBell userId={current.id} initialCount={unread} label={tNav("notifications")} />
            ) : null}
            <UserMenu {...user} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
