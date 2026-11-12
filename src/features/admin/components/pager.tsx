import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE } from "../schemas";

/** Previous / next links that keep the other filters. */
export async function Pager({
  pathname,
  query,
  page,
  total,
}: {
  pathname: "/admin/vendors" | "/admin/users" | "/admin/audit" | "/admin/payments";
  query: Record<string, string>;
  page: number;
  total: number;
}) {
  const t = await getTranslations("admin");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <nav aria-label={t("pagination")} className="flex items-center justify-between gap-2 text-sm">
      {page > 1 ? (
        <Button asChild variant="outline" size="sm">
          <Link href={{ pathname, query: { ...query, page: String(page - 1) } }}>{t("previous")}</Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground">{t("pageOf", { page, pages })}</span>
      {page < pages ? (
        <Button asChild variant="outline" size="sm">
          <Link href={{ pathname, query: { ...query, page: String(page + 1) } }}>{t("next")}</Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
