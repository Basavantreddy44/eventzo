import { getTranslations } from "next-intl/server";
import { siteConfig } from "@/config/site";
import { BrandLogo } from "./brand-logo";

export async function SiteFooter() {
  const t = await getTranslations("brand");
  return (
    <footer className="bg-card/60 border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="grid gap-1">
          <BrandLogo />
          <p className="text-muted-foreground text-sm">{t("tagline")}</p>
        </div>
        <p className="text-muted-foreground text-xs">© {siteConfig.name}</p>
      </div>
    </footer>
  );
}
