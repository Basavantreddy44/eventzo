import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MessageSquareQuote } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { ModerateReview } from "@/features/reviews/components/moderate-review";
import { ReviewCard } from "@/features/reviews/components/review-card";
import { getReviewsForModeration } from "@/features/reviews/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/reviews">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "reviews.admin" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AdminReviewsPage({ params, searchParams }: PageProps<"/[locale]/admin/reviews">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/admin/reviews"));
  const [t, tAdmin, sp] = await Promise.all([
    getTranslations("reviews.admin"),
    getTranslations("admin.dashboard"),
    searchParams,
  ]);
  if (!hasPermission(user.access, "reviews.moderate")) {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("title")} />
        <Card>
          <CardContent>{tAdmin("noPermission")}</CardContent>
        </Card>
      </div>
    );
  }
  const hiddenOnly = sp.filter === "hidden";
  const rows = await getReviewsForModeration(hiddenOnly ? "hidden" : "all");

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className="flex gap-1">
            <Button asChild size="sm" variant={hiddenOnly ? "ghost" : "secondary"}>
              <Link href="/admin/reviews">{t("filterAll")}</Link>
            </Button>
            <Button asChild size="sm" variant={hiddenOnly ? "secondary" : "ghost"}>
              <Link href={{ pathname: "/admin/reviews", query: { filter: "hidden" } }}>{t("filterHidden")}</Link>
            </Button>
          </div>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={MessageSquareQuote} title={t("empty")} description={t("emptyBody")} />
      ) : (
        <div className="grid gap-4">
          {rows.map((r) => (
            <Card key={r.id} data-testid="admin-review">
              <CardContent className="grid gap-3 pt-6">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {r.services?.slug ? (
                    <Link href={`/listings/${r.services.slug}`} className="text-primary font-medium hover:underline">
                      {r.services.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.services?.title}</span>
                  )}
                  <span className="text-muted-foreground">· {r.organizations?.name}</span>
                  {r.status === "hidden" ? <Badge variant="muted">{t("hidden")}</Badge> : null}
                </div>
                <ReviewCard review={r} locale={locale} vendorName={r.organizations?.name} />
                {r.status === "hidden" && r.hidden_reason ? (
                  <p className="text-muted-foreground text-xs">{t("hiddenBecause", { reason: r.hidden_reason })}</p>
                ) : null}
                <ModerateReview reviewId={r.id} hidden={r.status === "hidden"} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
