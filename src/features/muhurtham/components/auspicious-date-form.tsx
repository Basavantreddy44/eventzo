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
import { saveAuspiciousDate } from "../actions/admin";
import { auspiciousDateFormSchema, type AuspiciousDateFormInput } from "../schemas";

const EMPTY: AuspiciousDateFormInput = {
  date: "",
  cityId: "",
  title: "",
  notes: "",
  significance: "2",
  windows: "",
  source: "",
  isPublished: false,
};

export function AuspiciousDateForm({
  cities,
  initial,
}: {
  cities: { id: string; label: string }[];
  initial?: AuspiciousDateFormInput;
}) {
  const t = useTranslations("admin.muhurtham");
  const tSig = useTranslations("muhurtham.significance");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<AuspiciousDateFormInput>({
    resolver: zodResolver(auspiciousDateFormSchema),
    defaultValues: initial ?? EMPTY,
  });
  const { errors } = form.formState;
  const editing = !!initial?.id;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveAuspiciousDate(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("saved"));
      form.reset(EMPTY);
      router.replace("/admin/muhurtham");
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
      <div className="grid grid-cols-2 gap-3">
        <FormField id="date" label={t("date")} error={errors.date?.message}>
          <Input type="date" {...form.register("date")} />
        </FormField>
        <FormField id="significance" label={t("significance")} error={errors.significance?.message}>
          <NativeSelect {...form.register("significance")}>
            <option value="1">{tSig("low")}</option>
            <option value="2">{tSig("medium")}</option>
            <option value="3">{tSig("high")}</option>
          </NativeSelect>
        </FormField>
      </div>
      <FormField id="cityId" label={t("city")} error={errors.cityId?.message}>
        <NativeSelect {...form.register("cityId")}>
          <option value="">{t("allCities")}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="title" label={t("dateTitle")} error={errors.title?.message}>
        <Input placeholder={t("dateTitlePlaceholder")} {...form.register("title")} />
      </FormField>
      <FormField
        id="windows"
        label={t("windows")}
        hint={t("windowsHint")}
        optionalLabel={tCommon("optional")}
        error={errors.windows?.message}
      >
        <textarea
          rows={2}
          className="border-input bg-card focus-visible:border-primary focus-visible:ring-ring aria-invalid:border-destructive w-full rounded-md border px-3 py-2 font-mono text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          {...form.register("windows")}
        />
      </FormField>
      <FormField id="source" label={t("source")} optionalLabel={tCommon("optional")} error={errors.source?.message}>
        <Input placeholder={t("sourcePlaceholder")} {...form.register("source")} />
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
          <Link href="/admin/muhurtham" className="text-primary text-sm underline-offset-4 hover:underline">
            {tCommon("cancel")}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
