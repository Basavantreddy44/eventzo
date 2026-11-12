"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { inviteEventMember, setEnquiryEvent } from "../actions";
import { inviteMemberSchema, type InviteMemberInput } from "../schemas";

type DynamicT = (key: string) => string;

export function InviteMemberForm({ eventId }: { eventId: string }) {
  const t = useTranslations("events.people");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { eventId, email: "", role: "cohost" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await inviteEventMember(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("invited"));
      form.reset({ eventId, email: "", role: values.role });
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3" aria-label={t("inviteTitle")}>
      <FormError message={formError} />
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <FormField id="m-email" label={t("email")} error={errors.email?.message}>
          <Input type="email" autoComplete="off" {...form.register("email")} />
        </FormField>
        <FormField id="m-role" label={t("role")} error={errors.role?.message}>
          <NativeSelect {...form.register("role")}>
            <option value="cohost">{t("roles.cohost")}</option>
            <option value="viewer">{t("roles.viewer")}</option>
          </NativeSelect>
        </FormField>
      </div>
      <p className="text-muted-foreground text-xs">{t("rolesHint")}</p>
      <Button type="submit" disabled={pending} className="sm:justify-self-start" data-testid="invite-member">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("invite")}
      </Button>
    </form>
  );
}

/** Enquiry page: file the enquiry (and its booking) under one of the customer's events. */
export function EnquiryEventSelect({
  enquiryId,
  current,
  events,
}: {
  enquiryId: string;
  current: string;
  events: { id: string; title: string }[];
}) {
  const t = useTranslations("events");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await setEnquiryEvent(enquiryId, value);
          if (!result.ok) return void toast.error(tRoot(result.error));
          toast.success(t("linkSaved"));
          router.refresh();
        });
      }}
    >
      <NativeSelect
        aria-label={t("partOfEvent")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-w-0 flex-1"
        data-testid="enquiry-event-select"
      >
        <option value="">{t("noEvent")}</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.title}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" size="sm" variant="outline" disabled={pending || value === current}>
        {t("saveLink")}
      </Button>
    </form>
  );
}
