"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { addBudgetLine, updateBudgetPlanned } from "../actions";
import { budgetLineSchema, type BudgetLineInput } from "../schemas";

type DynamicT = (key: string) => string;

export function AddBudgetLineForm({
  eventId,
  categories,
}: {
  eventId: string;
  /** Categories without a line yet. */
  categories: { id: string; name: string }[];
}) {
  const t = useTranslations("events.budget");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fresh = (): BudgetLineInput => ({ eventId, categoryId: categories[0]?.id ?? "", label: "", planned: "" });
  const form = useForm<BudgetLineInput>({ resolver: zodResolver(budgetLineSchema), defaultValues: fresh() });
  const { errors } = form.formState;
  const categoryId = useWatch({ control: form.control, name: "categoryId" });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await addBudgetLine({ ...values, label: values.categoryId ? "" : values.label });
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("lineAdded"));
      form.reset(fresh());
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3" aria-label={t("addTitle")}>
      <FormError message={formError} />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="b-cat" label={t("category")} error={errors.categoryId?.message}>
          <NativeSelect {...form.register("categoryId")}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="">{t("custom")}</option>
          </NativeSelect>
        </FormField>
        {categoryId === "" ? (
          <FormField id="b-label" label={t("label")} error={errors.label?.message}>
            <Input placeholder={t("labelPlaceholder")} {...form.register("label")} />
          </FormField>
        ) : null}
        <FormField id="b-planned" label={t("plannedRupees")} error={errors.planned?.message}>
          <Input inputMode="decimal" {...form.register("planned")} />
        </FormField>
      </div>
      <Button type="submit" disabled={pending} variant="outline" className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("addLine")}
      </Button>
    </form>
  );
}

/** Inline edit of one line's planned amount. */
export function PlannedAmountForm({ lineId, rupees, label }: { lineId: string; rupees: string; label: string }) {
  const t = useTranslations("events.budget");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [value, setValue] = useState(rupees);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex items-center justify-end gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updateBudgetPlanned({ lineId, planned: value });
          if (!result.ok) return void toast.error(tRoot(result.fieldErrors?.planned ?? result.error));
          toast.success(t("saved"));
          router.refresh();
        });
      }}
    >
      <Input
        aria-label={t("plannedFor", { label })}
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-28 text-right text-sm"
      />
      <Button type="submit" size="sm" variant="ghost" disabled={pending || value === rupees} className="h-8">
        {t("save")}
      </Button>
    </form>
  );
}
