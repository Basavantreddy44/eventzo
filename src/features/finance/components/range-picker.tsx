import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RANGE_PRESETS, type DateRange, type RangePreset } from "../lib/finance";

/**
 * Period chooser for finance and reports: preset links plus a custom from/to
 * form. Works without JavaScript (plain links and a GET form).
 */
export async function RangePicker({
  pathname,
  current,
  extra = {},
}: {
  pathname: "/vendor/finance" | "/vendor/reports";
  current: DateRange & { preset: RangePreset | "custom" };
  /** Other query params to keep (e.g. the active tab). */
  extra?: Record<string, string>;
}) {
  const t = await getTranslations("finance.ranges");
  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="range-picker">
      <nav aria-label={t("label")} className="flex flex-wrap gap-1">
        {RANGE_PRESETS.map((p) => (
          <Link
            key={p}
            href={{ pathname, query: { ...extra, range: p } }}
            aria-current={current.preset === p ? "true" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              current.preset === p ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
            )}
          >
            {t(p)}
          </Link>
        ))}
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-2" aria-label={t("custom")}>
        {Object.entries(extra).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="grid gap-1 text-xs">
          {t("from")}
          <Input type="date" name="from" defaultValue={current.from} className="h-8 text-xs" required />
        </label>
        <label className="grid gap-1 text-xs">
          {t("to")}
          <Input type="date" name="to" defaultValue={current.to} className="h-8 text-xs" required />
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-8">
          {t("apply")}
        </Button>
      </form>
    </div>
  );
}
