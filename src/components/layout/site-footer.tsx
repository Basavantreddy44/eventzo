import { getTranslations } from "next-intl/server";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "./brand-logo";

export async function SiteFooter() {
  const t = await getTranslations("brand");
  const tLegal = await getTranslations("legal.links");
  const links = [
    { href: "/legal/terms", label: tLegal("terms") },
    { href: "/legal/privacy", label: tLegal("privacy") },
    { href: "/legal/refunds", label: tLegal("refunds") },
    { href: "/legal/vendor-agreement", label: tLegal("vendorAgreement") },
  ];
  return (
    <footer className="bg-card/60 border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="grid gap-1">
          <BrandLogo />
          <p className="text-muted-foreground text-sm">{t("tagline")}</p>
        </div>
        <div className="grid gap-2 sm:justify-items-end">
          <nav aria-label={tLegal("label")} className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <p className="text-muted-foreground text-xs">© {siteConfig.name}</p>
        </div>
      </div>
    </footer>
  );
}
