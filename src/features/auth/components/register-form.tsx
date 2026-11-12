"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { PasswordInput } from "@/components/form/password-input";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { registerSchema, type RegisterInput } from "../schemas";
import { signUp } from "../actions";

export function RegisterForm() {
  const t = useTranslations("auth.register");
  const locale = useLocale() as AppLocale;
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "", locale },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signUp({ ...values, locale });
      if (result && !result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5" aria-label={t("title")}>
      <FormError message={formError} />

      <FormField id="fullName" label={t("fullName")} error={errors.fullName?.message}>
        <Input autoComplete="name" {...form.register("fullName")} />
      </FormField>

      <FormField id="email" label={t("email")} error={errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </FormField>

      <FormField id="password" label={t("password")} hint={t("passwordHint")} error={errors.password?.message}>
        <PasswordInput autoComplete="new-password" {...form.register("password")} />
      </FormField>

      <FormField id="confirmPassword" label={t("confirmPassword")} error={errors.confirmPassword?.message}>
        <PasswordInput autoComplete="new-password" {...form.register("confirmPassword")} />
      </FormField>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? t("submitting") : t("submit")}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        {t("haveAccount")}{" "}
        <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
          {t("loginLink")}
        </Link>
      </p>
    </form>
  );
}
