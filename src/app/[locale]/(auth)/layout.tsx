import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

export default async function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  const t = await getTranslations("brand");

  return (
    <div className="from-accent/50 to-background flex min-h-dvh flex-col bg-gradient-to-b">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <BrandLogo />
        <LocaleSwitcher />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <p className="text-muted-foreground pb-6 text-center text-xs">{t("tagline")}</p>
    </div>
  );
}
