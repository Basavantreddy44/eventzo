"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link2, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Print the day sheet, or share its link (it opens for the event's co-hosts and family viewers). */
export function DaySheetActions({ url, title }: { url: string; title: string }) {
  const t = useTranslations("events.daySheet");
  const text = t("shareText", { title, url });

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => window.print()}>
        <Printer aria-hidden />
        {t("print")}
      </Button>
      <Button size="sm" variant="outline" asChild>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
          <Share2 aria-hidden />
          {t("shareWhatsapp")}
        </a>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success(t("copied"));
          } catch {
            toast.error(t("copyFailed"));
          }
        }}
      >
        <Link2 aria-hidden />
        {t("copyLink")}
      </Button>
    </div>
  );
}
