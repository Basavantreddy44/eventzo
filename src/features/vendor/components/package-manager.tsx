"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { formatPaise } from "@/lib/money";
import { intlLocale } from "@/lib/datetime";
import { deletePackage, savePackage } from "../actions/packages";
import { PACKAGE_UNITS, packageSchema, type PackageInput, type PackageOutput } from "../schemas";

export type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  price_paise: number;
  price_unit: string | null;
  includes: string[];
  excludes: string[];
};

const textareaClass =
  "border-input bg-card focus-visible:border-primary focus-visible:ring-ring aria-invalid:border-destructive w-full rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm";

const MAX_PACKAGES = 6;

/** Vendor side of listing packages (Roadmap C6/V4): list, add, edit, delete. */
export function PackageManager({ serviceId, packages }: { serviceId: string; packages: PackageRow[] }) {
  const t = useTranslations("vendor.packages");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<PackageRow | "new" | null>(null);

  const unitLabel = (u: string | null) => (u ? t(`units.${u as "per_plate"}`) : t("units.whole"));
  const money = (p: number) => formatPaise(BigInt(p), { locale: intlLocale(locale) });

  return (
    <div className="grid gap-4" data-testid="package-manager">
      {packages.length === 0 && editing === null ? <p className="text-muted-foreground text-sm">{t("empty")}</p> : null}
      <ul className="grid gap-3">
        {packages.map((p) =>
          editing !== "new" && editing?.id === p.id ? (
            <li key={p.id}>
              <PackageForm serviceId={serviceId} initial={p} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={p.id} className="grid gap-2 rounded-lg border p-3 text-sm" data-testid="package-row">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid gap-0.5">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-primary-strong font-semibold">
                    {money(p.price_paise)}{" "}
                    <span className="text-muted-foreground text-xs font-normal">{unitLabel(p.price_unit)}</span>
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(p)}>
                    <Pencil aria-hidden />
                    {t("edit")}
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button type="button" variant="ghost" size="sm" aria-label={t("deleteNamed", { name: p.name })}>
                        <Trash2 aria-hidden />
                      </Button>
                    }
                    title={t("deleteTitle", { name: p.name })}
                    description={t("deleteBody")}
                    confirmLabel={t("delete")}
                    cancelLabel={tCommon("cancel")}
                    destructive
                    onConfirm={async () => {
                      const result = await deletePackage(p.id);
                      if (result.ok) {
                        toast.success(t("deleted"));
                        router.refresh();
                      } else toast.error(t("saveError"));
                    }}
                  />
                </div>
              </div>
              {p.includes.length ? (
                <ul className="grid gap-0.5">
                  {p.includes.map((line) => (
                    <li key={line} className="flex items-start gap-1.5">
                      <Check className="text-success mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <PackageForm serviceId={serviceId} onDone={() => setEditing(null)} />
      ) : packages.length < MAX_PACKAGES ? (
        <Button type="button" variant="outline" className="justify-self-start" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      ) : (
        <p className="text-muted-foreground text-xs">{t("max", { max: MAX_PACKAGES })}</p>
      )}
    </div>
  );
}

function PackageForm({ serviceId, initial, onDone }: { serviceId: string; initial?: PackageRow; onDone: () => void }) {
  const t = useTranslations("vendor.packages");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<PackageInput, unknown, PackageOutput>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      id: initial?.id ?? "",
      serviceId,
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      price: initial ? String(initial.price_paise / 100) : "",
      priceUnit: (initial?.price_unit ?? "") as PackageInput["priceUnit"],
      includes: (initial?.includes ?? []).join("\n"),
      excludes: (initial?.excludes ?? []).join("\n"),
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const result = await savePackage(form.getValues()); // raw text; the server validates again
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("saved"));
      onDone();
      router.refresh();
    });
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="bg-muted/30 grid gap-3 rounded-lg border p-3"
      aria-label={initial ? t("editTitle", { name: initial.name }) : t("addTitle")}
    >
      <FormError message={formError} />
      <FormField id="pkg-name" label={t("name")} hint={t("nameHint")} error={errors.name?.message}>
        <Input {...form.register("name")} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="pkg-price" label={t("price")} error={errors.price?.message}>
          <Input inputMode="decimal" placeholder="1,50,000" {...form.register("price")} />
        </FormField>
        <FormField id="pkg-unit" label={t("unit")} error={errors.priceUnit?.message}>
          <NativeSelect {...form.register("priceUnit")}>
            {PACKAGE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u ? t(`units.${u}`) : t("units.whole")}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField id="pkg-includes" label={t("includes")} hint={t("linesHint")} error={errors.includes?.message}>
        <textarea
          rows={4}
          className={textareaClass}
          placeholder={t("includesPlaceholder")}
          {...form.register("includes")}
        />
      </FormField>
      <FormField id="pkg-excludes" label={t("excludes")} hint={t("linesHint")} error={errors.excludes?.message}>
        <textarea
          rows={2}
          className={textareaClass}
          placeholder={t("excludesPlaceholder")}
          {...form.register("excludes")}
        />
      </FormField>
      <FormField
        id="pkg-description"
        label={t("description")}
        optionalLabel={tCommon("optional")}
        error={errors.description?.message}
      >
        <textarea rows={2} className={textareaClass} {...form.register("description")} />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} data-testid="package-save">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? tCommon("saving") : t("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          <X aria-hidden />
          {tCommon("cancel")}
        </Button>
      </div>
    </form>
  );
}
