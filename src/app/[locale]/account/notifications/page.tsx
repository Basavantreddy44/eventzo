import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Bell } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { requireUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { NotificationList, type NotificationView } from "@/features/notifications/components/notification-list";
import { PreferenceGrid, WhatsappOptIn } from "@/features/notifications/components/notification-settings";
import { isKnownKind, notificationValues } from "@/features/notifications/lib/templates";
import { getNotificationSettings, listNotifications } from "@/features/notifications/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/account/notifications">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "notifications" });
  return { title: t("title"), robots: { index: false } };
}

type DynamicT = (key: string, values?: Record<string, string>) => string;

export default async function NotificationsPage({ params }: PageProps<"/[locale]/account/notifications">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/account/notifications"));
  const [t, rows, settings] = await Promise.all([
    getTranslations("notifications"),
    listNotifications(user.id),
    getNotificationSettings(user.id),
  ]);
  const tKinds = t as unknown as DynamicT;

  const items: NotificationView[] = rows.map((n) => {
    const values = notificationValues(n.params, (p) => formatPaise(p));
    if (/^\d{4}-\d{2}-\d{2}$/.test(values.date))
      values.date = formatDateTime(`${values.date}T00:00:00Z`, locale, "UTC", { dateStyle: "medium" });
    if (values.status)
      values.status = t.has(`rsvpStatus.${values.status}` as "title")
        ? tKinds(`rsvpStatus.${values.status}`)
        : values.status;
    if (values.role)
      values.role = t.has(`roles.${values.role}` as "title") ? tKinds(`roles.${values.role}`) : values.role;
    return {
      id: n.id,
      text: isKnownKind(n.kind) ? tKinds(`kinds.${n.kind}`, values) : t("generic"),
      time: formatDateTime(n.created_at, locale),
      link: n.link,
      unread: !n.read_at,
    };
  });

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label={t("title")} className="grid content-start gap-3">
          {items.length === 0 ? (
            <EmptyState icon={Bell} title={t("empty")} description={t("emptyBody")} />
          ) : (
            <NotificationList items={items} />
          )}
        </section>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("whatsappTitle")}</CardTitle>
              <CardDescription>{t("whatsappBody")}</CardDescription>
            </CardHeader>
            <CardContent>
              <WhatsappOptIn phone={settings.phone} optedIn={settings.whatsappOptIn} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("preferencesTitle")}</CardTitle>
              <CardDescription>{t("preferencesBody")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <PreferenceGrid saved={settings.preferences} whatsappOn={settings.whatsappOptIn} />
              <p className="text-muted-foreground text-xs">{t("deliveryNote")}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
