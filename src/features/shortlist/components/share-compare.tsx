"use client";

import { useTranslations } from "next-intl";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Share the comparison on WhatsApp or copy the link (Roadmap C4). The link works without signing in. */
export function ShareCompare({ url, titles }: { url: string; titles: string[] }) {
  const t = useTranslations("shortlist");
  const text = t("shareText", { list: titles.join(", "), url });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="share-whatsapp"
        >
          <Share2 aria-hidden />
          {t("shareWhatsapp")}
        </a>
      </Button>
      <Button type="button" variant="outline" onClick={copy}>
        <Copy aria-hidden />
        {t("copyLink")}
      </Button>
    </div>
  );
}
