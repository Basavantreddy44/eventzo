import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ScrollText } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { localeFrom } from "@/i18n/params";
import { NoPermission } from "@/features/admin/components/no-permission";
import { Pager } from "@/features/admin/components/pager";
import { loadAdminPage } from "@/features/admin/lib/page";
import { listAudit, listAuditTables } from "@/features/admin/queries";
import { parseAuditFilters } from "@/features/admin/schemas";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/audit">): Promise<Metadata> {
  const t = await getTranslations({ locale: await localeFrom(params), namespace: "admin.audit" });
  return { title: t("title"), robots: { index: false } };
}

/** Values shown in the change view; long blobs are shortened. */
function show(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

export default async function AdminAuditPage({ params, searchParams }: PageProps<"/[locale]/admin/audit">) {
  const { locale, allowed } = await loadAdminPage(params, "/admin/audit", "audit.read");
  const t = await getTranslations("admin.audit");
  if (!allowed) return <NoPermission title={t("title")} />;

  const sp = await searchParams;
  const f = parseAuditFilters(sp);
  const [{ rows, total, names }, tables] = await Promise.all([listAudit(f), listAuditTables()]);
  const query: Record<string, string> = Object.fromEntries(
    Object.entries({
      table: f.table,
      action: f.action,
      actor: f.actor,
      entity: f.entity,
      org: f.org,
      from: f.from,
      to: f.to,
    }).filter((e): e is [string, string] => !!e[1]),
  );

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <form method="get" className="flex flex-wrap items-end gap-2" aria-label={t("filter")}>
        {f.actor ? <input type="hidden" name="actor" value={f.actor} /> : null}
        {f.org ? <input type="hidden" name="org" value={f.org} /> : null}
        <label className="grid gap-1 text-xs">
          {t("table")}
          <NativeSelect name="table" defaultValue={f.table ?? ""} className="h-9 w-auto">
            <option value="">{t("allTables")}</option>
            {tables.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-xs">
          {t("action")}
          <Input name="action" defaultValue={f.action ?? ""} placeholder="organizations.update" className="h-9 w-48" />
        </label>
        <label className="grid gap-1 text-xs">
          {t("entity")}
          <Input name="entity" defaultValue={f.entity ?? ""} className="h-9 w-48" />
        </label>
        <label className="grid gap-1 text-xs">
          {t("from")}
          <Input type="date" name="from" defaultValue={f.from ?? ""} className="h-9" />
        </label>
        <label className="grid gap-1 text-xs">
          {t("to")}
          <Input type="date" name="to" defaultValue={f.to ?? ""} className="h-9" />
        </label>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          {t("apply")}
        </Button>
        {Object.keys(query).length ? (
          <Button asChild variant="ghost" size="sm" className="h-9">
            <Link href="/admin/audit">{t("clear")}</Link>
          </Button>
        ) : null}
      </form>
      {f.actor || f.org ? (
        <p className="text-muted-foreground text-sm">
          {f.actor ? t("byActor", { name: names.get(f.actor) ?? f.actor }) : t("forVendor")}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("empty")} />
      ) : (
        <ol className="grid gap-2" data-testid="audit-entries">
          {rows.map((r) => {
            const meta = r.metadata as Record<string, unknown> | null;
            const fields = r.changed_fields ?? [];
            const oldData = (r.old_data ?? {}) as Record<string, unknown>;
            const newData = (r.new_data ?? {}) as Record<string, unknown>;
            return (
              <li key={r.id} className="bg-card rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <code className="text-xs font-semibold">{r.action}</code>
                  <span className="text-muted-foreground text-xs">{formatDateTime(r.occurred_at, locale)}</span>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {r.actor_user_id ? (
                    <Link
                      href={{ pathname: "/admin/audit", query: { actor: r.actor_user_id } }}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {names.get(r.actor_user_id) ?? r.actor_user_id.slice(0, 8)}
                    </Link>
                  ) : (
                    t("system", { role: r.actor_db_role })
                  )}
                  {" · "}
                  {r.entity_table}
                  {r.entity_id ? ` · ${r.entity_id}` : ""}
                </p>
                {meta && Object.keys(meta).length ? (
                  <p className="mt-1 text-xs">
                    {Object.entries(meta)
                      .map(([k, v]) => `${k}: ${show(v)}`)
                      .join(" · ")}
                  </p>
                ) : null}
                {fields.length ? (
                  <details className="mt-2">
                    <summary className="text-primary cursor-pointer text-xs">
                      {t("changes", { count: fields.length })}
                    </summary>
                    <dl className="mt-2 grid gap-1 text-xs">
                      {fields.map((k) => (
                        <div key={k} className="grid grid-cols-[8rem_1fr] gap-2 break-all">
                          <dt className="font-medium">{k}</dt>
                          <dd>
                            <span className="text-muted-foreground line-through">{show(oldData[k])}</span> →{" "}
                            {show(newData[k])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <Pager pathname="/admin/audit" query={query} page={f.page} total={total} />
    </div>
  );
}
