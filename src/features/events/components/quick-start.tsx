"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { quickStartEvent } from "../actions";
import { EVENT_TYPES, quickStartSchema, type QuickStartInput } from "../schemas";

/**
 * Roadmap C1: "What's the occasion? When? How many guests?" Signed in, it
 * creates the event and opens matching venues; signed out, it opens the
 * venues and offers to save the event after sign-up.
 */
export function QuickStart({
  signedIn,
  cityId,
  citySlug,
  today,
}: {
  signedIn: boolean;
  cityId: string;
  citySlug: string | null;
  today: string;
}) {
  const t = useTranslations("home.quickStart");
  const tTypes = useTranslations("events.types");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const form = useForm<QuickStartInput>({
    resolver: zodResolver(quickStartSchema),
    defaultValues: { eventType: "wedding", startDate: "", guestEstimate: "", cityId, idempotencyKey },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    const query: Record<string, string> = { category: "venues", guests: values.guestEstimate };
    if (citySlug) query.city = citySlug;
    startTransition(async () => {
      if (!signedIn) {
        router.push({
          pathname: "/search",
          query: { ...query, start: "1", type: values.eventType, date: values.startDate },
        });
        return;
      }
      const result = await quickStartEvent(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      router.push({ pathname: "/search", query: { ...query, event: result.data } });
    });
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={t("title")}
      className="bg-card grid gap-4 rounded-xl border p-4 shadow-sm sm:p-5"
      data-testid="quick-start"
    >
      <p className="font-medium">{t("title")}</p>
      <FormError message={formError} />
      <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_0.8fr_auto] sm:items-end">
        <FormField id="qs-type" label={t("occasion")} error={errors.eventType?.message}>
          <NativeSelect {...form.register("eventType")}>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {tTypes(type)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="qs-date" label={t("when")} error={errors.startDate?.message}>
          <Input type="date" min={today} {...form.register("startDate")} />
        </FormField>
        <FormField id="qs-guests" label={t("guests")} error={errors.guestEstimate?.message}>
          <Input inputMode="numeric" placeholder="300" {...form.register("guestEstimate")} />
        </FormField>
        <Button type="submit" size="lg" disabled={pending} data-testid="quick-start-submit">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("submit")}
          {pending ? null : <ArrowRight aria-hidden />}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{signedIn ? t("hintSignedIn") : t("hintSignedOut")}</p>
    </form>
  );
}
