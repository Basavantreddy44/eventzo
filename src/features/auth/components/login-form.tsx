"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2, Mail } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { PasswordInput } from "@/components/form/password-input";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { loginSchema, magicLinkSchema, type LoginInput } from "../schemas";
import { sendMagicLink, signInWithPassword } from "../actions";

export function LoginForm() {
  const t = useTranslations("auth.login");
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const urlError = searchParams.get("error");
  const [formError, setFormError] = useState<string | null>(urlError === "link" ? "auth.errors.linkInvalid" : null);
  const [pending, startTransition] = useTransition();
  const [magicPending, startMagic] = useTransition();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signInWithPassword(values, next);
      if (result && !result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
      }
    });
  });

  const onMagicLink = () => {
    setFormError(null);
    const parsed = magicLinkSchema.safeParse({ email: form.getValues("email") });
    if (!parsed.success) {
      form.setError("email", { message: parsed.error.issues[0]?.message ?? "validation.email" });
      return;
    }
    startMagic(async () => {
      const result = await sendMagicLink(parsed.data, next);
      if (result && !result.ok) setFormError(result.error);
    });
  };

  const busy = pending || magicPending;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5" aria-label={t("title")}>
      <FormError message={formError} />

      <FormField id="email" label={t("email")} error={errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </FormField>

      <FormField id="password" label={t("password")} error={errors.password?.message}>
        <PasswordInput autoComplete="current-password" {...form.register("password")} />
      </FormField>

      <div className="-mt-2 flex justify-end">
        <Link href="/forgot-password" className="text-primary text-sm underline-offset-4 hover:underline">
          {t("forgot")}
        </Link>
      </div>

      <Button type="submit" size="lg" disabled={busy}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? t("submitting") : t("submit")}
      </Button>

      <div className="text-muted-foreground flex items-center gap-3 text-xs uppercase">
        <span className="bg-border h-px flex-1" />
        {t("orDivider")}
        <span className="bg-border h-px flex-1" />
      </div>

      <div className="grid gap-1.5">
        <Button type="button" variant="outline" size="lg" onClick={onMagicLink} disabled={busy}>
          {magicPending ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}
          {magicPending ? t("magicLinkSending") : t("magicLinkSubmit")}
        </Button>
        <p className="text-muted-foreground text-center text-xs">{t("magicLinkHint")}</p>
      </div>

      <p className="text-muted-foreground text-center text-sm">
        {t("noAccount")}{" "}
        <Link
          href={next ? { pathname: "/register", query: { next } } : "/register"}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          {t("registerLink")}
        </Link>
      </p>
    </form>
  );
}
