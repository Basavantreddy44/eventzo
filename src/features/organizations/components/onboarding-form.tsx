"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { createOrganizationSchema, type CreateOrganizationInput } from "../schemas";
import { createOrganization } from "../actions";

type Option = { id: string; label: string };

export function OnboardingForm({ categories, cities }: { categories: Option[]; cities: Option[] }) {
  const t = useTranslations("vendor.onboarding");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // One key per form instance: double-submits/retries create a single organisation.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: "", businessCategoryId: "", cityId: "", idempotencyKey },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await createOrganization({ ...values, idempotencyKey });
      if (result && !result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5" aria-label={t("title")}>
      <FormError message={formError} />

      <FormField id="name" label={t("name")} error={errors.name?.message}>
        <Input autoComplete="organization" placeholder={t("namePlaceholder")} {...form.register("name")} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="businessCategoryId" label={t("category")} error={errors.businessCategoryId?.message}>
          <NativeSelect {...form.register("businessCategoryId")}>
            <option value="">{t("categoryPlaceholder")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        <FormField id="cityId" label={t("city")} error={errors.cityId?.message}>
          <NativeSelect {...form.register("cityId")}>
            <option value="">{t("cityPlaceholder")}</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <p className="text-muted-foreground text-sm">{t("reviewNote")}</p>

      <Button type="submit" size="lg" disabled={pending} className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
