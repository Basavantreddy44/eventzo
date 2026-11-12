"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { inviteMember } from "../actions/team";
import { inviteSchema, type InviteInput } from "../schemas";

const EMPTY: InviteInput = { email: "", role: "staff", branchIds: [] };

export function InviteForm({ branches }: { branches: { id: string; label: string }[] }) {
  const t = useTranslations("vendor.team");
  const tRoles = useTranslations("roles");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<InviteInput>({ resolver: zodResolver(inviteSchema), defaultValues: EMPTY });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await inviteMember(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      const message =
        result.data === "emailed"
          ? t("sentEmail", { email: values.email })
          : result.data === "existing"
            ? t("sentExisting", { email: values.email })
            : t("sentNoEmail", { email: values.email });
      if (result.data === "not_emailed") toast.warning(message);
      else toast.success(message);
      form.reset(EMPTY);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("invite")}>
      <FormError message={formError} />
      <FormField id="invite-email" label={t("email")} error={errors.email?.message}>
        <Input type="email" inputMode="email" autoComplete="off" {...form.register("email")} />
      </FormField>
      <FormField id="invite-role" label={t("role")} error={errors.role?.message}>
        <NativeSelect {...form.register("role")}>
          <option value="staff">{tRoles("staff")}</option>
          <option value="branch_manager">{tRoles("branch_manager")}</option>
        </NativeSelect>
      </FormField>
      {branches.length > 0 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t("branches")}</legend>
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" value={b.id} className="accent-primary size-4" {...form.register("branchIds")} />
              {b.label}
            </label>
          ))}
          <p className="text-muted-foreground text-xs">{t("branchesHint")}</p>
        </fieldset>
      ) : null}
      <Button type="submit" disabled={pending} className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {pending ? t("sending") : t("send")}
      </Button>
    </form>
  );
}
