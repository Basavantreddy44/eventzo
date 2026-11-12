"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, FormField } from "@/components/form/form-field";
import { PasswordInput } from "@/components/form/password-input";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { resetPasswordSchema, type ResetPasswordInput } from "../schemas";
import { updatePassword } from "../actions";

export function ResetPasswordForm() {
  const t = useTranslations("auth.reset");
  const tRegister = useTranslations("auth.register");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updatePassword(values);
      if (result && !result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5" aria-label={t("title")}>
      <FormError message={formError} />
      <FormField id="password" label={t("password")} hint={tRegister("passwordHint")} error={errors.password?.message}>
        <PasswordInput autoComplete="new-password" {...form.register("password")} />
      </FormField>
      <FormField id="confirmPassword" label={t("confirmPassword")} error={errors.confirmPassword?.message}>
        <PasswordInput autoComplete="new-password" {...form.register("confirmPassword")} />
      </FormField>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
