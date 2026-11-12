import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { CalendarHeart, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { RsvpForm } from "@/features/events/components/rsvp-form";
import { getInvitationByToken } from "@/features/events/queries";

type Props = PageProps<"/[locale]/invite/[token]">;

// Private, per-guest page: never indexed, never cached for others.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "rsvp" });
  return { title: t("pageTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default function InvitePage({ params }: Props) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Invitation params={params} />
      </Suspense>
    </div>
  );
}

const day = (d: string, locale: string) => formatDateTime(`${d}T00:00:00Z`, locale, "UTC", { dateStyle: "full" });

async function Invitation({ params }: { params: Props["params"] }) {
  await connection();
  const { token } = await params;
  const locale = await localeFrom(params);
  const inv = await getInvitationByToken(token);
  if (!inv) notFound();
  const [t, tTypes] = await Promise.all([getTranslations("rsvp"), getTranslations("events.types")]);
  const when =
    inv.start_date === inv.end_date
      ? day(inv.start_date, locale)
      : `${day(inv.start_date, locale)} – ${day(inv.end_date, locale)}`;

  return (
    <div className="grid gap-6">
      <Card className="border-gold/60 overflow-hidden text-center" data-testid="invitation-card">
        <div className="bg-primary text-primary-foreground px-6 py-8">
          <p className="text-primary-foreground/80 text-sm">{t("dear", { name: inv.guest_name })}</p>
          {inv.hosts_text ? <p className="mt-3 text-sm">{t("hostsInvite", { hosts: inv.hosts_text })}</p> : null}
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="invitation-title">
            {inv.event_title}
          </h1>
          <p className="text-primary-foreground/80 mt-1 text-sm">{tTypes(inv.event_type as "wedding")}</p>
        </div>
        <CardContent className="grid gap-3 py-6 text-sm">
          <p className="flex items-center justify-center gap-2">
            <CalendarHeart className="text-gold size-4" aria-hidden />
            {when}
          </p>
          {inv.venue_text || inv.city_name ? (
            <p className="flex items-center justify-center gap-2">
              <MapPin className="text-gold size-4" aria-hidden />
              {[inv.venue_text, inv.city_name].filter(Boolean).join(", ")}
            </p>
          ) : null}
          {inv.invitation_message ? (
            <p className="text-muted-foreground mx-auto max-w-prose whitespace-pre-line">{inv.invitation_message}</p>
          ) : null}
          <p className="text-muted-foreground text-xs">{t("partyOf", { count: inv.party_size })}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("formTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {inv.rsvp_open ? (
            <RsvpForm
              token={token}
              partySize={inv.party_size}
              initial={{ status: inv.rsvp_status, count: inv.attending_count, note: inv.rsvp_note ?? "" }}
            />
          ) : (
            <p className="text-sm" data-testid="rsvp-closed">
              {t("closedBody")}
            </p>
          )}
          {inv.rsvp_status !== "pending" ? (
            <p className="text-muted-foreground mt-4 text-xs" data-testid="rsvp-current">
              {t("current", { status: t(`choices.${inv.rsvp_status as "attending"}`) })}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-center text-xs">{t("privacy")}</p>
    </div>
  );
}
