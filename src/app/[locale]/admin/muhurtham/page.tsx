import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CalendarHeart, Pencil } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { DeleteRowButton } from "@/components/delete-row-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { localizedPath } from "@/lib/auth/portal-user";
import { createClient } from "@/lib/supabase/server";
import { localeFrom } from "@/i18n/params";
import { deleteAuspiciousDate } from "@/features/muhurtham/actions/admin";
import { AuspiciousDateForm } from "@/features/muhurtham/components/auspicious-date-form";
import { todayIn } from "@/features/muhurtham/lib/calendar";
import { significanceKey } from "@/features/muhurtham/queries";
import { formatWindows } from "@/features/muhurtham/schemas";
import { getActiveCities, localizedName } from "@/features/taxonomy/queries";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/muhurtham">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "admin.muhurtham" });
  return { title: t("title"), robots: { index: false } };
}

type Window = { start: string; end: string };
const asWindows = (v: unknown): Window[] =>
  Array.isArray(v) ? v.filter((w): w is Window => !!w && typeof w.start === "string" && typeof w.end === "string") : [];

export default async function AdminMuhurthamPage({ params, searchParams }: PageProps<"/[locale]/admin/muhurtham">) {
  const locale = await localeFrom(params);
  const user = await requireUser(locale, localizedPath(locale, "/admin/muhurtham"));
  const [t, tSig, tAdmin] = await Promise.all([
    getTranslations("admin.muhurtham"),
    getTranslations("muhurtham.significance"),
    getTranslations("admin.dashboard"),
  ]);

  if (!hasPermission(user.access, "auspicious_dates.manage")) {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("title")} />
        <Card>
          <CardContent>{tAdmin("noPermission")}</CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data, error }, cities, sp] = await Promise.all([
    supabase
      .from("auspicious_dates")
      .select("id, date, city_id, title, notes, significance, muhurtham_windows, source, is_published")
      .gte("date", todayIn("Asia/Kolkata"))
      .order("date")
      .limit(200),
    getActiveCities(),
    searchParams,
  ]);
  if (error) throw new Error(`Failed to load auspicious dates: ${error.message}`);

  const rows = data ?? [];
  const cityName = new Map(cities.map((c) => [c.id, localizedName(c, locale)]));
  const editId = typeof sp.edit === "string" ? sp.edit : undefined;
  const editing = rows.find((r) => r.id === editId);
  type Row = (typeof rows)[number];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-2">
          <p className="text-muted-foreground text-xs">{t("upcomingOnly")}</p>
          <DataTable<Row>
            rows={rows}
            rowKey={(r) => r.id}
            caption={t("title")}
            empty={<EmptyState icon={CalendarHeart} title={t("empty")} />}
            columns={[
              {
                key: "date",
                header: t("date"),
                cell: (r) => (
                  <span className="font-medium whitespace-nowrap">
                    {formatDateTime(`${r.date}T00:00:00Z`, locale, "UTC", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                ),
              },
              { key: "title", header: t("dateTitle"), cell: (r) => r.title },
              {
                key: "city",
                header: t("city"),
                cell: (r) => (r.city_id ? cityName.get(r.city_id) : t("allCities")),
                hideOnMobile: true,
              },
              {
                key: "significance",
                header: t("significance"),
                cell: (r) => (
                  <Badge variant={r.significance >= 3 ? "default" : "gold"}>
                    {tSig(significanceKey(r.significance))}
                  </Badge>
                ),
                hideOnMobile: true,
              },
              {
                key: "status",
                header: t("status"),
                cell: (r) => <StatusBadge status={r.is_published ? "active" : "draft"} />,
              },
              {
                key: "actions",
                header: "",
                className: "text-right",
                cell: (r) => (
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={{ pathname: "/admin/muhurtham", query: { edit: r.id } }}>
                        <Pencil aria-hidden />
                        {t("edit")}
                      </Link>
                    </Button>
                    <DeleteRowButton
                      action={deleteAuspiciousDate.bind(null, r.id)}
                      label={t("delete")}
                      title={t("deleteTitle")}
                      description={t("deleteBody")}
                      successMessage={t("deleted")}
                    />
                  </div>
                ),
              },
            ]}
          />
        </div>
        <Card className="content-start">
          <CardHeader>
            <CardTitle>{editing ? t("formTitleEdit") : t("formTitleNew")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AuspiciousDateForm
              key={editing?.id ?? "new"}
              cities={cities.map((c) => ({ id: c.id, label: localizedName(c, locale) }))}
              initial={
                editing
                  ? {
                      id: editing.id,
                      date: editing.date,
                      cityId: editing.city_id ?? "",
                      title: editing.title,
                      notes: editing.notes ?? "",
                      significance: String(Math.min(Math.max(editing.significance, 1), 3)) as "1" | "2" | "3",
                      windows: formatWindows(asWindows(editing.muhurtham_windows)),
                      source: editing.source ?? "",
                      isPublished: editing.is_published,
                    }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
