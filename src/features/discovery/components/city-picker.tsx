"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setPreferredCity } from "../actions";

const ALL = "__all__";

/**
 * Header city picker. Remembers the choice in a cookie; on pages that read a
 * `city` URL param it also drops that param so the new choice takes effect.
 */
export function CityPicker({ cities, current }: { cities: { slug: string; label: string }[]; current: string | null }) {
  const t = useTranslations("city");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const currentLabel = cities.find((c) => c.slug === current)?.label;

  const onChange = (value: string) =>
    startTransition(async () => {
      const result = await setPreferredCity(value === ALL ? null : value);
      if (!result.ok) {
        toast.error(t("switchFailed"));
        return;
      }
      const query = Object.fromEntries(searchParams.entries());
      if ("city" in query || "page" in query) {
        delete query.city;
        delete query.page;
        router.replace({ pathname, query });
      }
      router.refresh();
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending} aria-label={t("choose")} data-testid="city-picker">
          <MapPin className="text-gold" aria-hidden />
          <span className="hidden max-w-[8rem] truncate sm:inline">{currentLabel ?? t("all")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("choose")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={current ?? ALL} onValueChange={onChange}>
          {cities.map((c) => (
            <DropdownMenuRadioItem key={c.slug} value={c.slug}>
              {c.label}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value={ALL}>{t("all")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
