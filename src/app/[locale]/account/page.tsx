import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Briefcase, MailOpen, PartyPopper, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/datetime";
import { InvitationResponse } from "@/features/vendor/components/invitation-response";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { requireUser } from "@/lib/auth/session";
import { isPlatformAdmin, vendorMemberships } from "@/lib/auth/permissions";
import { localizedPath } from "@/lib/auth/portal-user";
import { ProfileForm } from "@/features/account/components/profile-form";
import { getMyProfile } from "@/features/account/queries";
import { listMyEvents } from "@/features/events/queries";
import { localeFrom } from "@/i18n/params";

// Auth-gated (the layout may render Access denied instead of this page).
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/account">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/account"));
  const [t, tRoles, profile] = await Promise.all([
    getTranslations("account"),
    getTranslations("roles"),
    getMyProfile(user.id),
  ]);
  const memberships = vendorMemberships(user.access);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("profileTitle")}</CardTitle>
            <CardDescription>{t("profileSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              email={profile?.email ?? user.email}
              defaults={{
                fullName: profile?.full_name ?? "",
                displayName: profile?.display_name ?? "",
                phone: profile?.phone ?? "",
                preferredLocale: (profile?.preferred_locale ?? locale) as AppLocale,
              }}
            />
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="text-gold size-4" aria-hidden />
                {t("rolesTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex flex-wrap gap-1.5" data-testid="platform-roles">
                {user.access.roles.map((role) => (
                  <Badge key={role} variant="secondary">
                    {tRoles.has(role as never) ? tRoles(role as never) : role}
                  </Badge>
                ))}
              </div>
              {isPlatformAdmin(user.access) ? (
                <Button asChild variant="outline" size="sm" className="justify-self-start">
                  <Link href="/admin">{t("openAdmin")}</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="text-gold size-4" aria-hidden />
                {t("vendorAccessTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {memberships.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("vendorAccessEmpty")}</p>
              ) : (
                <ul className="grid gap-2">
                  {memberships.map((m) => (
                    <li key={m.organization_id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{m.organization_name}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Badge variant="outline">{tRoles(m.role)}</Badge>
                        <StatusBadge status={m.organization_status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                asChild
                variant={memberships.length ? "default" : "outline"}
                size="sm"
                className="justify-self-start"
              >
                <Link href={memberships.length ? "/vendor" : "/become-a-vendor"}>
                  {memberships.length ? t("openVendor") : (await getTranslations("nav"))("becomeVendor")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Invitations locale={locale} />

      <section className="grid gap-3" aria-labelledby="events-heading">
        <h2 id="events-heading" className="text-lg font-semibold">
          {t("eventsTitle")}
        </h2>
        <MyEvents userId={user.id} locale={locale} />
      </section>
    </div>
  );
}

/** Up to three upcoming events (owned or shared), linking to the workspace. */
async function MyEvents({ userId, locale }: { userId: string; locale: string }) {
  const [t, tEvents, events] = await Promise.all([
    getTranslations("account"),
    getTranslations("events"),
    listMyEvents(userId),
  ]);
  const upcoming = events.filter((e) => e.status === "planning").slice(0, 3);
  if (upcoming.length === 0) {
    return (
      <EmptyState
        icon={PartyPopper}
        title={t("eventsEmptyTitle")}
        description={t("eventsEmptyBody")}
        action={
          <Button asChild>
            <Link href="/account/events">{tEvents("newTitle")}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {upcoming.map((e) => (
        <Link
          key={e.id}
          href={`/account/events/${e.id}`}
          className="bg-card hover:border-primary/50 grid gap-1 rounded-lg border p-4 transition-colors"
        >
          <span className="font-medium">{e.title}</span>
          <span className="text-muted-foreground text-sm">
            {tEvents(`types.${e.event_type as "wedding"}`)} ·{" "}
            {formatDateTime(`${e.start_date}T00:00:00Z`, locale, "UTC", { dateStyle: "medium" })}
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Pending team invitations addressed to the signed-in user's email. */
async function Invitations({ locale }: { locale: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_invitations");
  if (error) throw new Error(`Failed to load invitations: ${error.message}`);
  if (!data?.length) return null;
  const [t, tRoles] = await Promise.all([getTranslations("account"), getTranslations("roles")]);

  return (
    <section className="grid gap-3" aria-labelledby="invitations-heading" data-testid="invitations">
      <h2 id="invitations-heading" className="flex items-center gap-2 text-lg font-semibold">
        <MailOpen className="text-gold size-5" aria-hidden />
        {t("invitationsTitle")}
      </h2>
      <ul className="grid gap-2">
        {data.map((inv) => (
          <li
            key={inv.id}
            className="border-gold/40 bg-accent/30 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          >
            <div className="grid gap-0.5">
              <p className="font-medium">
                {t("invitationBody", { org: inv.organization_name, role: tRoles(inv.role) })}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("invitationExpires", {
                  date: formatDateTime(inv.expires_at, locale, undefined, { dateStyle: "medium" }),
                })}
              </p>
            </div>
            <InvitationResponse invitationId={inv.id} vendorHref={localizedPath(locale, "/vendor")} />
          </li>
        ))}
      </ul>
    </section>
  );
}
