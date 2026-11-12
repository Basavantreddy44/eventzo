import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * Rendered by portal layouts when a signed-in user lacks the role for that
 * area. (Next's forbidden() is still experimental, so we render explicitly.)
 */
export async function AccessDenied({
  description,
  action,
}: {
  description: string;
  action?: { href: string; label: string };
}) {
  const t = await getTranslations();
  return (
    <div className="bg-background flex min-h-dvh items-center justify-center p-6">
      <div
        className="bg-card flex max-w-md flex-col items-center gap-4 rounded-xl border px-6 py-10 text-center shadow-xs"
        data-testid="access-denied"
      >
        <span className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
          <ShieldAlert className="size-6" aria-hidden />
        </span>
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">{t("errors.accessDeniedTitle")}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {action ? (
            <Button asChild>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/account">{t("nav.account")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
