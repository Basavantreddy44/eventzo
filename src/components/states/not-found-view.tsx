import { useTranslations } from "next-intl";
import { Compass } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function NotFoundView({ homeHref = "/" }: { homeHref?: string }) {
  const t = useTranslations();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center">
      <span className="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-full">
        <Compass className="size-6" aria-hidden />
      </span>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t("errors.notFoundTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("errors.notFoundBody")}</p>
      </div>
      <Button asChild>
        <Link href={homeHref}>{t("common.goHome")}</Link>
      </Button>
    </div>
  );
}
