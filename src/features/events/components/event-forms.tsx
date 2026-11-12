"use client";

import { useState, useTransition } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { createEvent, updateEventDetails } from "../actions";
import {
  createEventSchema,
  EVENT_TYPES,
  eventDetailsSchema,
  type CreateEventInput,
  type EventDetailsInput,
} from "../schemas";

export type CityOption = { id: string; name: string };

function EventTypeOptions() {
  const t = useTranslations("events.types");
  return EVENT_TYPES.map((type) => (
    <option key={type} value={type}>
      {t(type)}
    </option>
  ));
}

function CityOptions({ cities }: { cities: CityOption[] }) {
  const t = useTranslations("events");
  return (
    <>
      <option value="">{t("noCity")}</option>
      {cities.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </>
  );
}

export function CreateEventForm({ cities, defaultCityId }: { cities: CityOption[]; defaultCityId: string }) {
  const t = useTranslations("events");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [key] = useState(() => crypto.randomUUID());
  const form = useForm<CreateEventInput>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      title: "",
      eventType: "wedding",
      cityId: defaultCityId,
      startDate: "",
      endDate: "",
      guestEstimate: "",
      idempotencyKey: key,
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await createEvent(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("created"));
      router.push(`/account/events/${result.data}`);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("newTitle")}>
      <FormError message={formError} />
      <FormField id="ev-title" label={t("eventTitle")} hint={t("eventTitleHint")} error={errors.title?.message}>
        <Input {...form.register("title")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="ev-type" label={t("eventType")} error={errors.eventType?.message}>
          <NativeSelect {...form.register("eventType")}>
            <EventTypeOptions />
          </NativeSelect>
        </FormField>
        <FormField id="ev-city" label={t("city")} optionalLabel={tCommon("optional")} error={errors.cityId?.message}>
          <NativeSelect {...form.register("cityId")}>
            <CityOptions cities={cities} />
          </NativeSelect>
        </FormField>
        <FormField id="ev-start" label={t("startDate")} error={errors.startDate?.message}>
          <Input type="date" {...form.register("startDate")} />
        </FormField>
        <FormField id="ev-end" label={t("endDate")} optionalLabel={tCommon("optional")} error={errors.endDate?.message}>
          <Input type="date" {...form.register("endDate")} />
        </FormField>
        <FormField
          id="ev-guests"
          label={t("guestEstimate")}
          optionalLabel={tCommon("optional")}
          error={errors.guestEstimate?.message}
        >
          <Input inputMode="numeric" {...form.register("guestEstimate")} />
        </FormField>
      </div>
      <Button type="submit" disabled={pending} className="sm:justify-self-start" data-testid="create-event">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? tCommon("saving") : t("create")}
      </Button>
    </form>
  );
}

export function EventDetailsForm({ cities, initial }: { cities: CityOption[]; initial: EventDetailsInput }) {
  const t = useTranslations("events");
  const tCommon = useTranslations("common");
  const router = useNextRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<EventDetailsInput>({ resolver: zodResolver(eventDetailsSchema), defaultValues: initial });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updateEventDetails(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("saved"));
      form.reset(values);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("detailsTitle")}>
      <FormError message={formError} />
      <FormField id="ed-title" label={t("eventTitle")} error={errors.title?.message}>
        <Input {...form.register("title")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="ed-type" label={t("eventType")} error={errors.eventType?.message}>
          <NativeSelect {...form.register("eventType")}>
            <EventTypeOptions />
          </NativeSelect>
        </FormField>
        <FormField id="ed-city" label={t("city")} optionalLabel={tCommon("optional")} error={errors.cityId?.message}>
          <NativeSelect {...form.register("cityId")}>
            <CityOptions cities={cities} />
          </NativeSelect>
        </FormField>
        <FormField id="ed-start" label={t("startDate")} error={errors.startDate?.message}>
          <Input type="date" {...form.register("startDate")} />
        </FormField>
        <FormField id="ed-end" label={t("endDate")} optionalLabel={tCommon("optional")} error={errors.endDate?.message}>
          <Input type="date" {...form.register("endDate")} />
        </FormField>
        <FormField
          id="ed-guests"
          label={t("guestEstimate")}
          optionalLabel={tCommon("optional")}
          error={errors.guestEstimate?.message}
        >
          <Input inputMode="numeric" {...form.register("guestEstimate")} />
        </FormField>
      </div>
      <h3 className="mt-2 font-medium">{t("invitationCard")}</h3>
      <p className="text-muted-foreground -mt-2 text-sm">{t("invitationCardHint")}</p>
      <FormField id="ed-hosts" label={t("hosts")} optionalLabel={tCommon("optional")} error={errors.hostsText?.message}>
        <Input placeholder={t("hostsPlaceholder")} {...form.register("hostsText")} />
      </FormField>
      <FormField id="ed-venue" label={t("venue")} optionalLabel={tCommon("optional")} error={errors.venueText?.message}>
        <Input placeholder={t("venuePlaceholder")} {...form.register("venueText")} />
      </FormField>
      <FormField
        id="ed-message"
        label={t("invitationMessage")}
        optionalLabel={tCommon("optional")}
        error={errors.invitationMessage?.message}
      >
        <textarea
          rows={4}
          className="border-input bg-card focus-visible:border-primary focus-visible:ring-ring rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
          {...form.register("invitationMessage")}
        />
      </FormField>
      <Button type="submit" disabled={pending} className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? tCommon("saving") : tCommon("save")}
      </Button>
    </form>
  );
}
