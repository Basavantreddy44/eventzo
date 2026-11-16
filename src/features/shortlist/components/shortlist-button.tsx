"use client";

import { useTranslations } from "next-intl";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SHORTLIST_MAX, useShortlist } from "../lib/shortlist";

/** Heart toggle for a listing (Roadmap C4). Sits above the card's stretched link. */
export function ShortlistButton({
  slug,
  title,
  variant = "icon",
  className,
}: {
  slug: string;
  title: string;
  variant?: "icon" | "button";
  className?: string;
}) {
  const t = useTranslations("shortlist");
  const { has, toggle } = useShortlist();
  const saved = has(slug);
  const label = saved ? t("remove", { title }) : t("add", { title });

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!toggle(slug)) toast.error(t("full", { max: SHORTLIST_MAX }));
  };

  if (variant === "button") {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        aria-pressed={saved}
        className={className}
        data-testid="shortlist-toggle"
      >
        <Heart className={cn(saved && "fill-primary text-primary")} aria-hidden />
        {saved ? t("saved") : t("save")}
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      data-testid="shortlist-toggle"
      className={cn(
        "bg-background/90 hover:bg-background focus-visible:ring-ring relative z-10 flex size-9 items-center justify-center rounded-full border shadow-sm outline-none focus-visible:ring-2",
        className,
      )}
    >
      <Heart className={cn("size-4", saved ? "fill-primary text-primary" : "text-muted-foreground")} aria-hidden />
    </button>
  );
}
