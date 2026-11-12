"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { addCalendarEntry } from "../actions/vendor";
import { calendarEntrySchema, type CalendarEntryInput } from "../schemas";

/** (A) Record an offline booking or a block so the online calendar stays truthful. */
export function CalendarEntryForm({
  resources,
  defaultResourceId,
  today,
}: {
  resources: { id: string; label: string }[];
  defaultResourceId: string;
  today: string;
}) {
  const t = useTranslations("calendar");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const empty: CalendarEntryInput = {
    resourceId: defaultResourceId,
    kind: "offline",
    date: today,
    startTime: "09:00",
    endTime: "23:00",
    notes: "",
  };
  const form = useForm<CalendarEntryInput>({ resolver: zodResolver(calendarEntrySchema), defaultValues: empty });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await addCalendarEntry(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("saved"));
      form.reset({ ...values, notes: "" });
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("addTitle")}>
      <FormError message={formError} />
      <FormField id="cal-resource" label={t("resource")} error={errors.resourceId?.message}>
        <NativeSelect {...form.register("resourceId")}>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="cal-kind" label={t("entryType")}>
        <NativeSelect {...form.register("kind")}>
          <option value="offline">{t("typeOffline")}</option>
          <option value="block">{t("typeBlock")}</option>
        </NativeSelect>
      </FormField>
      <FormField id="cal-date" label={t("date")} error={errors.date?.message}>
        <Input type="date" {...form.register("date")} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="cal-start" label={t("start")} error={errors.startTime?.message}>
          <Input type="time" step={900} {...form.register("startTime")} />
        </FormField>
        <FormField id="cal-end" label={t("end")} error={errors.endTime?.message}>
          <Input type="time" step={900} {...form.register("endTime")} />
        </FormField>
      </div>
      <FormField id="cal-notes" label={t("notes")} optionalLabel={tCommon("optional")} error={errors.notes?.message}>
        <Input placeholder={t("notesPlaceholder")} {...form.register("notes")} />
      </FormField>
      <Button type="submit" disabled={pending} className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? tCommon("saving") : t("save")}
      </Button>
    </form>
  );
}
