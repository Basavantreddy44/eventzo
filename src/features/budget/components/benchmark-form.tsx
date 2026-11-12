"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { saveBenchmark } from "../actions/admin";
import { benchmarkFormSchema, type BenchmarkFormInput } from "../schemas";

type Option = { id: string; label: string };

const EMPTY: BenchmarkFormInput = {
  businessCategoryId: "",
  cityId: "",
  unit: "per_event",
  low: "",
  high: "",
  notes: "",
  source: "",
  isPublished: false,
};

export function BenchmarkForm({
  categories,
  cities,
  initial,
}: {
  categories: Option[];
  cities: Option[];
  initial?: BenchmarkFormInput;
}) {
  const t = useTranslations("admin.pricing");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<BenchmarkFormInput>({
    resolver: zodResolver(benchmarkFormSchema),
    defaultValues: initial ?? EMPTY,
  });
  const { errors } = form.formState;
  const editing = !!initial?.id;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveBenchmark(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("saved"));
      form.reset(EMPTY);
      router.replace("/admin/pricing");
      router.refresh();
    });
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-4"
      aria-label={editing ? t("formTitleEdit") : t("formTitleNew")}
    >
      <FormError message={formError} />
      <FormField id="businessCategoryId" label={t("category")} error={errors.businessCategoryId?.message}>
        <NativeSelect {...form.register("businessCategoryId")} disabled={editing}>
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="cityId" label={t("city")} error={errors.cityId?.message}>
        <NativeSelect {...form.register("cityId")} disabled={editing}>
          <option value="">—</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="unit" label={t("unit")} error={errors.unit?.message}>
        <NativeSelect {...form.register("unit")}>
          <option value="per_event">{t("unitOptions.per_event")}</option>
          <option value="per_guest">{t("unitOptions.per_guest")}</option>
        </NativeSelect>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="low" label={t("low")} error={errors.low?.message}>
          <Input inputMode="decimal" {...form.register("low")} />
        </FormField>
        <FormField id="high" label={t("high")} error={errors.high?.message}>
          <Input inputMode="decimal" {...form.register("high")} />
        </FormField>
      </div>
      <FormField id="source" label={t("source")} optionalLabel={tCommon("optional")} error={errors.source?.message}>
        <Input {...form.register("source")} />
      </FormField>
      <FormField id="notes" label={t("notes")} optionalLabel={tCommon("optional")} error={errors.notes?.message}>
        <Input {...form.register("notes")} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-primary size-4" {...form.register("isPublished")} />
        {t("publishNow")}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? tCommon("saving") : t("save")}
        </Button>
        {editing ? (
          <Link href="/admin/pricing" className="text-primary text-sm underline-offset-4 hover:underline">
            {tCommon("cancel")}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
