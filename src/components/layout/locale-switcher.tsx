"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeLabels, localeShort, routing, type AppLocale } from "@/i18n/routing";
import { isLargeText, setLargeText } from "@/lib/text-size";
import { LOCALE_COOKIE } from "@/i18n/geo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("nav");
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [large, setLarge] = useState(false);

  return (
    <DropdownMenu onOpenChange={(open) => open && setLarge(isLargeText())}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${t("language")}: ${localeLabels[locale]}`}
          disabled={pending}
          className="gap-1 px-2"
          data-testid="locale-switcher"
        >
          <Languages aria-hidden />
          <span lang={locale} className="text-xs font-semibold">
            {compact ? localeShort[locale] : localeLabels[locale]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(next) => {
            // Remember the explicit choice (a saved choice beats the Kalaburagi default).
            document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
            startTransition(() => router.replace(pathname, { locale: next as AppLocale }));
          }}
        >
          {routing.locales.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l}>
              {localeLabels[l]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("display")}</DropdownMenuLabel>
        <DropdownMenuItem
          data-testid="large-text-toggle"
          role="menuitemcheckbox"
          aria-checked={large}
          onSelect={() => {
            setLargeText(!large);
            setLarge(!large);
          }}
        >
          <Check aria-hidden className={large ? "opacity-100" : "opacity-0"} />
          <span className="text-base">{t("largeText")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
