"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeLabels, routing, type AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { profileSchema, type ProfileInput } from "../schemas";
import { updateProfile } from "../actions";

export function ProfileForm({ defaults, email }: { defaults: ProfileInput; email: string | null }) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: defaults });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updateProfile(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      form.reset(values);
      toast.success(t("saved"));
      if (values.preferredLocale !== locale) router.replace(pathname, { locale: values.preferredLocale });
      else router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5" aria-label={t("profileTitle")}>
      <FormError message={formError} />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="fullName" label={t("fullName")} error={errors.fullName?.message}>
          <Input autoComplete="name" {...form.register("fullName")} />
        </FormField>
        <FormField
          id="displayName"
          label={t("displayName")}
          optionalLabel={tCommon("optional")}
          error={errors.displayName?.message}
        >
          <Input autoComplete="nickname" {...form.register("displayName")} />
        </FormField>
        <FormField id="email" label={t("email")} hint={t("emailHint")}>
          <Input type="email" value={email ?? ""} readOnly disabled />
        </FormField>
        <FormField
          id="phone"
          label={t("phone")}
          optionalLabel={tCommon("optional")}
          hint={t("phoneHint")}
          error={errors.phone?.message}
        >
          <Input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+91 98450 12345"
            {...form.register("phone")}
          />
        </FormField>
        <FormField id="preferredLocale" label={t("language")} error={errors.preferredLocale?.message}>
          <NativeSelect {...form.register("preferredLocale")}>
            {routing.locales.map((l) => (
              <option key={l} value={l} lang={l}>
                {localeLabels[l]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <Button type="submit" disabled={pending || !isDirty} className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? tCommon("saving") : tCommon("save")}
      </Button>
    </form>
  );
}
