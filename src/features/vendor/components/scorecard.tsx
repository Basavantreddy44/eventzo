import { getTranslations } from "next-intl/server";
import { Ban, Clock3, Handshake, Star } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { scorecardView, type Scorecard } from "../lib/scorecard";

/** Roadmap V9: four numbers that decide how customers see the business, with a tip when one is weak. */
export async function VendorScorecard({ data }: { data: Scorecard }) {
  const t = await getTranslations("vendor.scorecard");
  const v = scorecardView(data);
  const tiles = [
    {
      key: "response",
      icon: Clock3,
      value: v.responseHours == null ? "—" : t("hours", { hours: v.responseHours }),
      sub: t("responseSub", { answered: data.answered, total: data.enquiries }),
      weak: v.weak.response,
    },
    {
      key: "conversion",
      icon: Handshake,
      value: v.conversionPercent == null ? "—" : `${v.conversionPercent}%`,
      sub: t("conversionSub", { won: data.won, quoted: data.quoted }),
      weak: v.weak.conversion,
    },
    {
      key: "rating",
      icon: Star,
      value: data.rating == null ? "—" : `${data.rating.toFixed(1)}★`,
      sub: t("ratingSub", { count: data.reviews }),
      weak: v.weak.rating,
    },
    {
      key: "cancellations",
      icon: Ban,
      value: String(data.vendor_cancellations),
      sub: t("cancellationsSub"),
      weak: v.weak.cancellations,
    },
  ] as const;

  return (
    <section className="grid gap-3" aria-labelledby="scorecard-heading" data-testid="scorecard">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="scorecard-heading" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <span className="text-muted-foreground text-xs">{t("period")}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.key} className="gap-2" data-testid={`score-${tile.key}`}>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <tile.icon className="size-4" aria-hidden />
                {t(`${tile.key}.label`)}
              </CardDescription>
              <CardTitle className={`text-2xl tabular-nums ${tile.weak ? "text-destructive" : ""}`}>
                {tile.value}
              </CardTitle>
              <p className="text-muted-foreground text-xs">{tile.sub}</p>
              {tile.weak ? <p className="text-xs">{t(`${tile.key}.tip`)}</p> : null}
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
