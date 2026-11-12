"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schemas";
import { requestPasswordReset } from "../actions";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (result && !result.ok) setFormError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5" aria-label={t("title")}>
      <FormError message={formError} />
      <FormField id="email" label={t("email")} error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </FormField>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? t("submitting") : t("submit")}
      </Button>
      <Link href="/login" className="text-primary text-center text-sm underline-offset-4 hover:underline">
        {t("backToLogin")}
      </Link>
    </form>
  );
}
