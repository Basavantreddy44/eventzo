"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { localeLabels, routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { updateBusinessProfile } from "../actions/profile";
import { businessProfileSchema, type BusinessProfileInput } from "../schemas";

const textareaClass =
  "border-input bg-card focus-visible:border-primary focus-visible:ring-ring aria-invalid:border-destructive w-full rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export function BusinessProfileForm({ defaults, readOnly }: { defaults: BusinessProfileInput; readOnly: boolean }) {
  const t = useTranslations("vendor.profile");
  const tCommon = useTranslations("common");
  // Validation messages are runtime i18n keys.
  const tRoot = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<BusinessProfileInput>({ resolver: zodResolver(businessProfileSchema), defaultValues: defaults });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updateBusinessProfile(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      form.reset(values);
      toast.success(t("saved"));
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-8" aria-label={t("title")}>
      <FormError message={formError} />
      <fieldset disabled={readOnly || pending} className="grid gap-8">
        <section className="grid gap-4">
          <h2 className="font-semibold">{t("sectionBusiness")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="name" label={t("name")} error={errors.name?.message}>
              <Input autoComplete="organization" {...form.register("name")} />
            </FormField>
            <FormField
              id="legalName"
              label={t("legalName")}
              optionalLabel={tCommon("optional")}
              error={errors.legalName?.message}
            >
              <Input {...form.register("legalName")} />
            </FormField>
            <FormField
              id="displayName"
              label={t("displayName")}
              optionalLabel={tCommon("optional")}
              error={errors.displayName?.message}
            >
              <Input {...form.register("displayName")} />
            </FormField>
            <FormField
              id="yearEstablished"
              label={t("yearEstablished")}
              optionalLabel={tCommon("optional")}
              error={errors.yearEstablished?.message}
            >
              <Input inputMode="numeric" maxLength={4} {...form.register("yearEstablished")} />
            </FormField>
          </div>
          <FormField
            id="tagline"
            label={t("tagline")}
            optionalLabel={tCommon("optional")}
            error={errors.tagline?.message}
          >
            <Input placeholder={t("taglinePlaceholder")} {...form.register("tagline")} />
          </FormField>
          <FormField
            id="description"
            label={t("description")}
            hint={t("descriptionHint")}
            error={errors.description?.message}
          >
            <textarea rows={5} className={textareaClass} {...form.register("description")} />
          </FormField>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t("languages")}</legend>
            <div className="flex flex-wrap gap-3">
              {routing.locales.map((l) => (
                <label key={l} className="flex items-center gap-2 text-sm" lang={l}>
                  <input type="checkbox" value={l} className="accent-primary size-4" {...form.register("languages")} />
                  {localeLabels[l]}
                </label>
              ))}
            </div>
            {errors.languages?.message ? (
              <p role="alert" className="text-destructive text-xs font-medium">
                {tRoot(errors.languages.message)}
              </p>
            ) : null}
          </fieldset>
        </section>

        <section className="grid gap-4">
          <h2 className="font-semibold">{t("sectionContact")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="contactPhone"
              label={t("contactPhone")}
              hint={t("contactPhoneHint")}
              error={errors.contactPhone?.message}
            >
              <Input type="tel" inputMode="tel" placeholder="+91 98450 12345" {...form.register("contactPhone")} />
            </FormField>
            <FormField
              id="whatsappPhone"
              label={t("whatsappPhone")}
              optionalLabel={tCommon("optional")}
              error={errors.whatsappPhone?.message}
            >
              <Input type="tel" inputMode="tel" {...form.register("whatsappPhone")} />
            </FormField>
            <FormField
              id="contactEmail"
              label={t("contactEmail")}
              optionalLabel={tCommon("optional")}
              error={errors.contactEmail?.message}
            >
              <Input type="email" inputMode="email" {...form.register("contactEmail")} />
            </FormField>
            <FormField
              id="website"
              label={t("website")}
              optionalLabel={tCommon("optional")}
              error={errors.website?.message}
            >
              <Input type="url" inputMode="url" placeholder="https://" {...form.register("website")} />
            </FormField>
          </div>
        </section>

        <section className="grid gap-4">
          <h2 className="font-semibold">{t("sectionTax")}</h2>
          <p className="text-muted-foreground text-sm">{t("taxHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="gstin" label={t("gstin")} optionalLabel={tCommon("optional")} error={errors.gstin?.message}>
              <Input className="uppercase" maxLength={15} {...form.register("gstin")} />
            </FormField>
            <FormField id="pan" label={t("pan")} optionalLabel={tCommon("optional")} error={errors.pan?.message}>
              <Input className="uppercase" maxLength={10} {...form.register("pan")} />
            </FormField>
          </div>
        </section>
      </fieldset>

      {readOnly ? null : (
        <Button type="submit" disabled={pending || !isDirty} className="sm:justify-self-start">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? tCommon("saving") : t("save")}
        </Button>
      )}
    </form>
  );
}
