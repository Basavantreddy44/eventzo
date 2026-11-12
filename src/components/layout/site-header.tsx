import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { CityPicker } from "@/features/discovery/components/city-picker";
import { getPreferredCitySlug } from "@/features/discovery/lib/city-preference";
import { getActiveCities, localizedName } from "@/features/taxonomy/queries";
import { SiteMobileMenu } from "./site-mobile-menu";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { isPlatformAdmin, isVendorMember } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo } from "./brand-logo";
import { LocaleSwitcher } from "./locale-switcher";
import { UserMenu } from "./user-menu";

/**
 * Public marketplace header. The city picker and the auth area stream in
 * (they read cookies); everything else is part of the static shell.
 */
export async function SiteHeader() {
  const t = await getTranslations("nav");
  const tCommon = await getTranslations("common");
  const links = [
    { href: "/search", label: t("search") },
    { href: "/muhurtham", label: t("muhurtham") },
    { href: "/budget-estimator", label: t("estimator") },
    { href: "/become-a-vendor", label: t("becomeVendor") },
  ];

  return (
    <header className="bg-background/90 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <SiteMobileMenu links={links} title={t("home")} openLabel={tCommon("openMenu")} closeLabel={tCommon("close")} />
        <BrandLogo />
        <nav aria-label={t("home")} className="ml-4 hidden items-center gap-0.5 md:flex">
          {links.map((l) => (
            <Button key={l.href} asChild variant="ghost" size="sm">
              <Link href={l.href}>{l.label}</Link>
            </Button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Suspense fallback={<Skeleton className="h-8 w-9 sm:w-24" />}>
            <HeaderCity />
          </Suspense>
          {/* Reads the URL (usePathname), which isn't known when prerendering dynamic routes. */}
          <Suspense fallback={<Skeleton className="size-10" />}>
            <LocaleSwitcher compact />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-9 w-16 sm:w-36" />}>
            <HeaderAuth />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function HeaderCity() {
  const [locale, current] = await Promise.all([getLocale(), getPreferredCitySlug()]);
  let cities: Awaited<ReturnType<typeof getActiveCities>> = [];
  try {
    cities = await getActiveCities();
  } catch (error) {
    console.error(error);
    return null; // the picker is optional; never break the header
  }
  return (
    <CityPicker cities={cities.map((c) => ({ slug: c.slug, label: localizedName(c, locale) }))} current={current} />
  );
}

async function HeaderAuth() {
  const t = await getTranslations("nav");
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex items-center gap-1 sm:gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">{t("login")}</Link>
        </Button>
        {/* Phones: login only (registration is linked from the login page and the hero). */}
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link href="/register">{t("register")}</Link>
        </Button>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <UserMenu
      name={profile?.display_name || profile?.full_name || user.email || ""}
      email={user.email}
      showVendor={isVendorMember(user.access)}
      showAdmin={isPlatformAdmin(user.access)}
    />
  );
}
