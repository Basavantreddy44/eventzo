import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CalendarHeart, PartyPopper } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { getActiveCities, localizedName } from "@/features/taxonomy/queries";
import { getPreferredCitySlug } from "@/features/discovery/lib/city-preference";
import { respondEventInvitation } from "@/features/events/actions";
import { CreateEventForm } from "@/features/events/components/event-forms";
import { listMyEvents, myEventInvitations } from "@/features/events/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/account/events">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "events" });
  return { title: t("title"), robots: { index: false } };
}

const day = (d: string, locale: string) => formatDateTime(`${d}T00:00:00Z`, locale, "UTC", { dateStyle: "medium" });

export default async function MyEventsPage({ params }: PageProps<"/[locale]/account/events">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/account/events"));
  const [t, events, invitations, cities, preferred] = await Promise.all([
    getTranslations("events"),
    listMyEvents(user.id),
    myEventInvitations(),
    getActiveCities(),
    getPreferredCitySlug(),
  ]);
  const cityOptions = cities.map((c) => ({ id: c.id, name: localizedName(c, locale) }));
  const defaultCityId = cities.find((c) => c.slug === preferred)?.id ?? "";

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {invitations.length > 0 ? (
        <Card className="border-gold/50" data-testid="event-invitations">
          <CardHeader>
            <CardTitle>{t("invitationsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="grid gap-0.5 text-sm">
                  <span className="font-medium">{inv.event_title}</span>
                  <span className="text-muted-foreground">
                    {t("invitedBy", { name: inv.invited_by_name ?? "—", role: t(`people.roles.${inv.role}`) })} ·{" "}
                    {day(inv.start_date, locale)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <ActionButton
                    action={respondEventInvitation.bind(null, inv.id, true)}
                    label={t("accept")}
                    successMessage={t("joined")}
                    variant="default"
                    testId="accept-event-invitation"
                  />
                  <ActionButton
                    action={respondEventInvitation.bind(null, inv.id, false)}
                    label={t("decline")}
                    successMessage={t("declinedInvite")}
                    variant="outline"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="events-list" className="grid content-start gap-3">
          <h2 id="events-list" className="sr-only">
            {t("title")}
          </h2>
          {events.length === 0 ? (
            <EmptyState icon={PartyPopper} title={t("empty")} description={t("emptyBody")} />
          ) : (
            events.map((e) => (
              <Link
                key={e.id}
                href={`/account/events/${e.id}`}
                className="bg-card hover:border-primary/50 grid gap-1 rounded-lg border p-4 transition-colors"
                data-testid="event-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{e.title}</span>
                  <div className="flex gap-1">
                    {e.role !== "owner" ? <Badge variant="gold">{t(`people.roles.${e.role}`)}</Badge> : null}
                    <StatusBadge status={e.status} />
                  </div>
                </div>
                <span className="text-muted-foreground flex items-center gap-1 text-sm">
                  <CalendarHeart className="size-4" aria-hidden />
                  {t(`types.${e.event_type as "wedding"}`)} · {day(e.start_date, locale)}
                  {e.end_date !== e.start_date ? ` – ${day(e.end_date, locale)}` : ""}
                </span>
              </Link>
            ))
          )}
        </section>

        <Card className="content-start">
          <CardHeader>
            <CardTitle>{t("newTitle")}</CardTitle>
            <CardDescription>{t("newBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateEventForm cities={cityOptions} defaultCityId={defaultCityId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
