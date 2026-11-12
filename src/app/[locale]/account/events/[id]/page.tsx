import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/auth/session";
import { localizedPath } from "@/lib/auth/portal-user";
import { cn } from "@/lib/utils";
import { localeFrom } from "@/i18n/params";
import { setEventStatus } from "@/features/events/actions";
import { BudgetTab, GuestsTab, OverviewTab, PeopleTab } from "@/features/events/components/event-tabs";
import { getEvent } from "@/features/events/queries";
import { EVENT_TABS, type EventTab } from "@/features/events/schemas";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/account/events/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "events" });
  return { title: t("title"), robots: { index: false } };
}

const day = (d: string, locale: string) => formatDateTime(`${d}T00:00:00Z`, locale, "UTC", { dateStyle: "medium" });

export default async function EventWorkspacePage({ params, searchParams }: PageProps<"/[locale]/account/events/[id]">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/account/events"));
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const found = await getEvent(id, user.id);
  if (!found) notFound();
  const { event, role } = found;
  const tab: EventTab = (EVENT_TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as EventTab) : "overview";
  const t = await getTranslations("events");
  const props = { event, role, locale, userId: user.id };

  return (
    <div className="grid gap-6">
      <Link
        href="/account/events"
        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={event.title}
        description={`${t(`types.${event.event_type as "wedding"}`)} · ${day(event.start_date, locale)}${
          event.end_date !== event.start_date ? ` – ${day(event.end_date, locale)}` : ""
        }`}
        actions={
          <>
            {role !== "owner" ? <Badge variant="gold">{t(`people.roles.${role}`)}</Badge> : null}
            <StatusBadge status={event.status} />
            {role === "owner" && event.status === "planning" ? (
              <>
                <ActionButton
                  action={setEventStatus.bind(null, event.id, "completed")}
                  label={t("markCompleted")}
                  successMessage={t("statusSaved")}
                  variant="outline"
                  confirm={{ title: t("completeTitle"), description: t("completeBody") }}
                />
                <ActionButton
                  action={setEventStatus.bind(null, event.id, "cancelled")}
                  label={t("cancelEvent")}
                  successMessage={t("statusSaved")}
                  variant="ghost"
                  confirm={{ title: t("cancelTitle"), description: t("cancelBody"), destructive: true }}
                />
              </>
            ) : null}
            {role === "owner" && event.status !== "planning" ? (
              <ActionButton
                action={setEventStatus.bind(null, event.id, "planning")}
                label={t("reopen")}
                successMessage={t("statusSaved")}
                variant="outline"
              />
            ) : null}
          </>
        }
      />

      <nav aria-label={t("sections")} className="flex gap-1 overflow-x-auto border-b">
        {EVENT_TABS.map((name) => (
          <Link
            key={name}
            href={name === "overview" ? `/account/events/${event.id}` : `/account/events/${event.id}?tab=${name}`}
            aria-current={tab === name ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              tab === name
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
            data-testid={`tab-${name}`}
          >
            {t(`tabs.${name}`)}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? <OverviewTab {...props} /> : null}
      {tab === "guests" ? <GuestsTab {...props} /> : null}
      {tab === "budget" ? <BudgetTab {...props} /> : null}
      {tab === "people" ? <PeopleTab {...props} /> : null}
    </div>
  );
}
