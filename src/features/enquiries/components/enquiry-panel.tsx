"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { CalendarCheck, CalendarX, HelpCircle, Loader2, Sparkles } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { checkAvailability, createEnquiry, type AvailabilityCheck } from "../actions/customer";
import { enquirySchema, type EnquiryInput } from "../schemas";

const textareaClass =
  "border-input bg-card focus-visible:border-primary focus-visible:ring-ring aria-invalid:border-destructive w-full rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm";

/** Listing-page panel: pick a date → live availability → send enquiry / reserve (G). */
export function EnquiryPanel({
  serviceId,
  instant,
  signedIn,
  loginHref,
  today,
  maxGuests,
}: {
  serviceId: string;
  instant: boolean;
  signedIn: boolean;
  loginHref: string;
  today: string;
  maxGuests: number | null;
}) {
  const t = useTranslations("enquiry");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityCheck | null>(null);
  const [checking, startCheck] = useTransition();
  const [pending, startTransition] = useTransition();
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const form = useForm<EnquiryInput>({
    resolver: zodResolver(enquirySchema),
    defaultValues: {
      serviceId,
      date: "",
      startTime: "10:00",
      endTime: "22:00",
      guests: "",
      message: "",
      idempotencyKey,
    },
  });
  const { errors } = form.formState;
  const date = useWatch({ control: form.control, name: "date" });

  if (!signedIn) {
    return (
      <div className="grid gap-3">
        <p className="text-muted-foreground text-sm">{t("loginToEnquire")}</p>
        <Button asChild size="lg" className="w-full">
          <Link href={loginHref}>{instant ? t("reserve") : t("send")}</Link>
        </Button>
      </div>
    );
  }

  const onDateChange = (value: string) => {
    setAvailability(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    startCheck(async () => {
      const result = await checkAvailability(serviceId, value);
      if (result.ok) setAvailability(result.data);
    });
  };

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await createEnquiry(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        if (result.error === "enquiry.unavailableError")
          setAvailability((a) => (a ? { ...a, status: "unavailable" } : a));
        return;
      }
      router.push(`/account/enquiries/${result.data}`);
    });
  });

  const unavailable = availability?.status === "unavailable";

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-4"
      aria-label={instant ? t("panelTitleInstant") : t("panelTitle")}
      data-testid="enquiry-panel"
    >
      <FormError message={formError} />
      <FormField id="enq-date" label={t("date")} error={errors.date?.message}>
        <Input type="date" min={today} {...form.register("date", { onChange: (e) => onDateChange(e.target.value) })} />
      </FormField>

      {date ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite" data-testid="availability">
          {checking ? (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t("checking")}
            </span>
          ) : availability ? (
            <>
              {availability.status === "available" ? (
                <Badge variant="success">
                  <CalendarCheck aria-hidden /> {t("available")}
                </Badge>
              ) : availability.status === "unavailable" ? (
                <Badge variant="destructive">
                  <CalendarX aria-hidden /> {t("unavailable")}
                </Badge>
              ) : (
                <Badge variant="muted">
                  <HelpCircle aria-hidden /> {t("unknown")}
                </Badge>
              )}
              {availability.auspicious ? (
                <Badge variant="gold">
                  <Sparkles aria-hidden /> {t("auspicious")}
                </Badge>
              ) : null}
              {availability.surchargeBps > 0 ? (
                <span className="text-muted-foreground text-xs">
                  {t("surcharge", { percent: availability.surchargeBps / 100 })}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <FormField id="enq-start" label={t("start")} error={errors.startTime?.message}>
          <Input type="time" step={900} {...form.register("startTime")} />
        </FormField>
        <FormField id="enq-end" label={t("end")} error={errors.endTime?.message}>
          <Input type="time" step={900} {...form.register("endTime")} />
        </FormField>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">{t("timesHint")}</p>
      <FormField id="enq-guests" label={t("guests")} error={errors.guests?.message}>
        <Input inputMode="numeric" max={maxGuests ?? undefined} {...form.register("guests")} />
      </FormField>
      {!instant ? (
        <FormField id="enq-message" label={t("message")} error={errors.message?.message}>
          <textarea
            rows={3}
            className={textareaClass}
            placeholder={t("messagePlaceholder")}
            {...form.register("message")}
          />
        </FormField>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending || unavailable}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? t("sending") : instant ? t("reserve") : t("send")}
      </Button>
      <p className="text-muted-foreground text-xs">{instant ? t("instantNote") : t("holdNote")}</p>
    </form>
  );
}
