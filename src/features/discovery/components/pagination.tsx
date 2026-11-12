import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE, toSearchQuery, type SearchFilters } from "../lib/search-params";

export async function SearchPagination({ filters, total }: { filters: SearchFilters; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const t = await getTranslations("search");
  const href = (page: number) => ({ pathname: "/search", query: toSearchQuery({ ...filters, page }) });

  return (
    <nav aria-label={t("page", { page: filters.page, pages })} className="flex items-center justify-between gap-3">
      {filters.page > 1 ? (
        <Button asChild variant="outline">
          <Link href={href(filters.page - 1)} rel="prev">
            <ChevronLeft aria-hidden />
            {t("previous")}
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground text-sm">{t("page", { page: filters.page, pages })}</span>
      {filters.page < pages ? (
        <Button asChild variant="outline">
          <Link href={href(filters.page + 1)} rel="next">
            {t("next")}
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
