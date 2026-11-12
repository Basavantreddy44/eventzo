import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Send } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { localizedPath } from "@/lib/auth/portal-user";
import { localeFrom } from "@/i18n/params";
import { processOutboxNow } from "@/features/notifications/actions";
import { getDeliveryMode } from "@/features/notifications/lib/delivery";
import { isKnownKind, maskAddress, NOTIFICATION_KINDS } from "@/features/notifications/lib/templates";
import { listOutbox, outboxCounts } from "@/features/notifications/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/notifications">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "outbox" });
  return { title: t("title"), robots: { index: false } };
}

const FILTERS = ["queued", "failed", "all"] as const;

export default async function OutboxPage({ params, searchParams }: PageProps<"/[locale]/admin/notifications">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/admin/notifications"));
  const [t, tAdmin, sp] = await Promise.all([
    getTranslations("outbox"),
    getTranslations("admin.dashboard"),
    searchParams,
  ]);

  if (!hasPermission(user.access, "notifications.manage")) {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("title")} />
        <Card>
          <CardContent>{tAdmin("noPermission")}</CardContent>
        </Card>
      </div>
    );
  }

  const filter = (FILTERS as readonly string[]).includes(String(sp.filter))
    ? (sp.filter as (typeof FILTERS)[number])
    : "queued";
  const mode = getDeliveryMode();
  const [rows, counts] = await Promise.all([listOutbox(filter), outboxCounts()]);
  type Row = (typeof rows)[number];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          mode ? (
            <ActionButton
              action={processOutboxNow}
              label={t("processNow")}
              successMessage={t("processed")}
              variant="default"
              testId="process-outbox"
            />
          ) : (
            <Button size="sm" disabled title={t("noProvider")}>
              {t("processNow")}
            </Button>
          )
        }
      />
      <p className="text-muted-foreground text-sm" data-testid="outbox-mode">
        {mode === "simulator" ? t("modeSimulator") : t("modeNone")}
      </p>
      <dl className="grid grid-cols-3 gap-3 sm:max-w-md">
        {(["queued", "sent", "failed"] as const).map((k) => (
          <div key={k} className="bg-card rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs">{t(`counts.${k}`)}</dt>
            <dd className="text-lg font-semibold">{counts[k]}</dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <Button key={f} asChild size="sm" variant={filter === f ? "secondary" : "ghost"}>
            <Link
              href={
                f === "queued" ? "/admin/notifications" : { pathname: "/admin/notifications", query: { filter: f } }
              }
            >
              {t(`filters.${f}`)}
            </Link>
          </Button>
        ))}
      </div>
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.id}
        caption={t("title")}
        empty={<EmptyState icon={Send} title={t("empty")} />}
        columns={[
          {
            key: "template",
            header: t("colTemplate"),
            cell: (r) => (
              <div className="grid gap-0.5">
                <span className="font-mono text-xs">
                  {r.channel === "whatsapp" && isKnownKind(r.template)
                    ? NOTIFICATION_KINDS[r.template].whatsapp.name
                    : r.template}
                </span>
                <span className="text-muted-foreground text-xs">{t(`channels.${r.channel as "whatsapp"}`)}</span>
              </div>
            ),
          },
          { key: "to", header: t("colTo"), cell: (r) => maskAddress(r.to_address) },
          {
            key: "status",
            header: t("colStatus"),
            cell: (r) => (
              <div className="grid justify-items-start gap-0.5">
                <StatusBadge status={r.status} />
                {r.last_error ? (
                  <span className="text-destructive max-w-60 text-xs break-words">{r.last_error}</span>
                ) : null}
              </div>
            ),
          },
          {
            key: "provider",
            header: t("colProvider"),
            hideOnMobile: true,
            cell: (r) => `${r.provider ?? "—"} · ${t("attempts", { count: r.attempts })}`,
          },
          {
            key: "created",
            header: t("colCreated"),
            hideOnMobile: true,
            cell: (r) => formatDateTime(r.sent_at ?? r.created_at, locale),
          },
        ]}
      />
    </div>
  );
}
