import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarHeart } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { intlLocale } from "@/lib/datetime";
import { getPreferredCitySlug } from "@/features/discovery/lib/city-preference";
import { getActiveCities } from "@/features/taxonomy/queries";
import { todayIn } from "../lib/calendar";
import { forCity, getAuspiciousDates, significanceKey } from "../queries";

/** Home-page strip of the next auspicious dates for the visitor's city. */
export async function UpcomingMuhurtham() {
  await connection();
  const [t, locale, citySlug] = await Promise.all([getTranslations("muhurtham"), getLocale(), getPreferredCitySlug()]);
  const today = todayIn("Asia/Kolkata");
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 180);

  let dates: Awaited<ReturnType<typeof getAuspiciousDates>>;
  try {
    const [all, cities] = await Promise.all([
      getAuspiciousDates(today, horizon.toISOString().slice(0, 10)),
      getActiveCities(),
    ]);
    dates = forCity(all, cities.find((c) => c.slug === citySlug)?.id ?? null).slice(0, 6);
  } catch (error) {
    console.error(error);
    return null; // optional section; never break the home page
  }

  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", timeZone: "UTC" });
  const month = new Intl.DateTimeFormat(intlLocale(locale), { month: "short", timeZone: "UTC" });
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", timeZone: "UTC" });

  return (
    <section className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:px-6" aria-labelledby="muhurtham-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2
            id="muhurtham-heading"
            className="font-display text-primary-strong flex items-center gap-2 text-2xl font-semibold"
          >
            <CalendarHeart className="text-gold size-6" aria-hidden />
            {t("upcomingTitle")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("disclaimer")}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/muhurtham">{t("viewCalendar")}</Link>
        </Button>
      </div>
      {dates.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("upcomingEmpty")}</p>
      ) : (
        <ul className="flex gap-3 overflow-x-auto pb-2" data-testid="upcoming-muhurtham">
          {dates.map((d) => {
            const date = new Date(`${d.date}T00:00:00Z`);
            const key = significanceKey(d.significance);
            return (
              <li
                key={d.id}
                className="bg-card flex min-w-28 flex-col items-center gap-1 rounded-xl border px-4 py-3 text-center"
              >
                <span className="text-muted-foreground text-xs uppercase">{weekday.format(date)}</span>
                <span className="font-display text-primary-strong text-3xl font-semibold">{day.format(date)}</span>
                <span className="text-sm">{month.format(date)}</span>
                <Badge variant={key === "high" ? "default" : "gold"} className="mt-1">
                  {t(`significance.${key}`)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
