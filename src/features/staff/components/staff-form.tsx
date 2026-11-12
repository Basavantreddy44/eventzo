"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { saveStaff } from "../actions";
import { staffSchema, type StaffInput } from "../schemas";

type Option = { id: string; label: string };

const EMPTY: StaffInput = { fullName: "", phone: "", skill: "", branchId: "", memberId: "", dayRate: "", notes: "" };

export function StaffForm({
  initial,
  branches,
  members,
  defaultBranchId,
  allowBusinessWide,
}: {
  initial?: StaffInput;
  branches: Option[];
  /** Team logins not yet linked to another roster entry. */
  members: Option[];
  defaultBranchId: string;
  /** Only owners can keep staff business-wide (no branch). */
  allowBusinessWide: boolean;
}) {
  const t = useTranslations("staff");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const empty = { ...EMPTY, branchId: defaultBranchId };
  const form = useForm<StaffInput>({ resolver: zodResolver(staffSchema), defaultValues: initial ?? empty });
  const { errors } = form.formState;
  const editing = !!initial?.id;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveStaff(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("saved"));
      form.reset(empty);
      router.replace("/vendor/staff");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={editing ? t("formEdit") : t("formNew")}>
      <FormError message={formError} />
      <FormField id="st-name" label={t("name")} error={errors.fullName?.message}>
        <Input autoComplete="off" {...form.register("fullName")} />
      </FormField>
      <FormField id="st-skill" label={t("skill")} optionalLabel={tCommon("optional")} error={errors.skill?.message}>
        <Input placeholder={t("skillPlaceholder")} {...form.register("skill")} />
      </FormField>
      <FormField id="st-phone" label={t("phone")} optionalLabel={tCommon("optional")} error={errors.phone?.message}>
        <Input inputMode="tel" placeholder="98450 12345" {...form.register("phone")} />
      </FormField>
      <FormField
        id="st-rate"
        label={t("dayRate")}
        hint={t("dayRateHint")}
        optionalLabel={tCommon("optional")}
        error={errors.dayRate?.message}
      >
        <Input inputMode="decimal" placeholder="1500" {...form.register("dayRate")} />
      </FormField>
      <FormField id="st-branch" label={t("branch")} error={errors.branchId?.message}>
        <NativeSelect {...form.register("branchId")}>
          {allowBusinessWide ? <option value="">{t("allBranches")}</option> : null}
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="st-member" label={t("login")} hint={t("loginHint")} error={errors.memberId?.message}>
        <NativeSelect {...form.register("memberId")}>
          <option value="">{t("noLogin")}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField
        id="st-notes"
        label={t("notes")}
        hint={t("notesHint")}
        optionalLabel={tCommon("optional")}
        error={errors.notes?.message}
      >
        <Input {...form.register("notes")} />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} data-testid="save-staff">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {editing ? t("saveChanges") : t("add")}
        </Button>
        {editing ? (
          <Button asChild variant="ghost">
            <Link href="/vendor/staff">{tCommon("cancel")}</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
