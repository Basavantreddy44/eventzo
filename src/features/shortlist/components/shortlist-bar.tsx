"use client";

import { useTranslations } from "next-intl";
import { Heart, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { compareHref, useShortlist } from "../lib/shortlist";

/** Bottom bar with the shortlist count and "Compare" (Roadmap C4). Hidden on the compare page itself. */
export function ShortlistBar() {
  const t = useTranslations("shortlist");
  const { items, clear } = useShortlist();
  const pathname = usePathname();
  if (items.length === 0 || pathname.startsWith("/compare")) return null;

  return (
    <>
      {/* Spacer so the fixed bar never covers the end of the page. */}
      <div className="h-16" aria-hidden />
      <div
        className="bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t shadow-lg backdrop-blur"
        role="region"
        aria-label={t("barLabel")}
        data-testid="shortlist-bar"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Heart className="fill-primary text-primary size-4" aria-hidden />
            {t("count", { count: items.length })}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              <X aria-hidden />
              {t("clear")}
            </Button>
            {items.length < 2 ? (
              <p className="text-muted-foreground text-xs">{t("addOneMore")}</p>
            ) : (
              <Button asChild size="sm" data-testid="shortlist-compare">
                <Link href={compareHref(items)}>{t("compare", { count: items.length })}</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
