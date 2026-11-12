"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { recordStaffPayout } from "@/features/finance/actions";
import { PAYMENT_MODES } from "@/features/finance/schemas";
import { assignStaff, ensureJob, saveJobDetails, updateAssignment } from "../actions";
import { assignmentEditSchema, assignSchema, type AssignInput, type AssignmentEditInput } from "../schemas";

type Option = { id: string; label: string };
type DynamicT = (key: string) => string;

const newKey = () => crypto.randomUUID();

/** Assign a roster member to a job (the job sheet is created on first use). */
export function AssignStaffForm({
  jobId,
  bookingItemId,
  reservationId,
  staff,
  defaultDate,
  idPrefix,
}: {
  jobId?: string;
  bookingItemId?: string;
  reservationId?: string;
  staff: Option[];
  /** IST date of the job, pre-filled for the call time. */
  defaultDate: string;
  idPrefix: string;
}) {
  const t = useTranslations("staff");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fresh = (): AssignInput => ({
    jobId: jobId ?? "",
    bookingItemId: bookingItemId ?? "",
    reservationId: reservationId ?? "",
    staffProfileId: "",
    roleLabel: "",
    callDate: "",
    callTime: "",
    pay: "",
  });
  const form = useForm<AssignInput>({ resolver: zodResolver(assignSchema), defaultValues: fresh() });
  const { errors } = form.formState;

  if (staff.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noStaffYet")}</p>;
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await assignStaff(values);
      if (!result.ok) {
        setFormError(result.fieldErrors ? null : result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("assigned"));
      form.reset(fresh());
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3" aria-label={t("assignTitle")}>
      <FormError message={formError} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`${idPrefix}-staff`} label={t("staffMember")} error={errors.staffProfileId?.message}>
          <NativeSelect {...form.register("staffProfileId")} data-testid="assign-staff-select">
            <option value="">{t("choose")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          id={`${idPrefix}-role`}
          label={t("roleLabel")}
          optionalLabel={tCommon("optional")}
          error={errors.roleLabel?.message}
        >
          <Input placeholder={t("rolePlaceholder")} {...form.register("roleLabel")} />
        </FormField>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-calldate`}>
            {t("callTime")} <span className="text-muted-foreground font-normal">({tCommon("optional")})</span>
          </Label>
          <div className="flex gap-2">
            <Input
              id={`${idPrefix}-calldate`}
              type="date"
              aria-label={t("callDate")}
              {...form.register("callDate")}
              onFocus={(e) => {
                if (!e.currentTarget.value) form.setValue("callDate", defaultDate);
              }}
            />
            <Input
              type="time"
              aria-label={t("callTime")}
              aria-invalid={!!errors.callTime || undefined}
              {...form.register("callTime")}
            />
          </div>
          {errors.callTime?.message ? (
            <FieldMessage message={errors.callTime.message} />
          ) : (
            <p className="text-muted-foreground text-xs">{t("callTimeHint")}</p>
          )}
        </div>
        <FormField
          id={`${idPrefix}-pay`}
          label={t("pay")}
          optionalLabel={tCommon("optional")}
          error={errors.pay?.message}
        >
          <Input inputMode="decimal" placeholder="1500" {...form.register("pay")} />
        </FormField>
      </div>
      <Button type="submit" disabled={pending} className="sm:justify-self-start" data-testid="assign-staff">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("assign")}
      </Button>
    </form>
  );
}

function FieldMessage({ message }: { message: string }) {
  const t = useTranslations() as unknown as DynamicT;
  return (
    <p role="alert" className="text-destructive text-xs font-medium">
      {t(message)}
    </p>
  );
}

/** Change the role, call time or pay of an open assignment. */
export function AssignmentEditForm({
  initial,
  idPrefix,
  onDone,
}: {
  initial: AssignmentEditInput;
  idPrefix: string;
  onDone?: () => void;
}) {
  const t = useTranslations("staff");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<AssignmentEditInput>({ resolver: zodResolver(assignmentEditSchema), defaultValues: initial });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updateAssignment(values);
      if (!result.ok) {
        setFormError(result.fieldErrors ? null : result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("assignmentSaved"));
      onDone?.();
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-2 sm:grid-cols-2" aria-label={t("editAssignment")}>
      <div className="sm:col-span-2">
        <FormError message={formError} />
      </div>
      <FormField id={`${idPrefix}-erole`} label={t("roleLabel")} error={errors.roleLabel?.message}>
        <Input {...form.register("roleLabel")} />
      </FormField>
      <FormField id={`${idPrefix}-epay`} label={t("pay")} error={errors.pay?.message}>
        <Input inputMode="decimal" {...form.register("pay")} />
      </FormField>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-edate`}>{t("callTime")}</Label>
        <div className="flex gap-2">
          <Input id={`${idPrefix}-edate`} type="date" aria-label={t("callDate")} {...form.register("callDate")} />
          <Input type="time" aria-label={t("callTime")} {...form.register("callTime")} />
        </div>
        {errors.callTime?.message ? <FieldMessage message={errors.callTime.message} /> : null}
      </div>
      <Button type="submit" size="sm" disabled={pending} className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("saveChanges")}
      </Button>
    </form>
  );
}

/** Records the staff member's payout for the job (creates a staff-payout expense). */
export function PayoutForm({
  assignmentId,
  suggestedRupees,
  today,
  idPrefix,
}: {
  assignmentId: string;
  suggestedRupees: string;
  today: string;
  idPrefix: string;
}) {
  const t = useTranslations("staff");
  const tModes = useTranslations("bookings.modes");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [amount, setAmount] = useState(suggestedRupees);
  const [mode, setMode] = useState<(typeof PAYMENT_MODES)[number]>("cash");
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(newKey);
  const [pending, startTransition] = useTransition();

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-2"
      aria-label={t("payoutTitle")}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await recordStaffPayout({
            assignmentId,
            amount,
            spentOn: today,
            mode,
            reference: "",
            idempotencyKey: key,
          });
          if (!result.ok) return setError(result.fieldErrors?.amount ?? result.error);
          toast.success(t("payoutSaved"));
          router.refresh();
        });
      }}
    >
      <div className="grid gap-1">
        <Label htmlFor={`${idPrefix}-pamt`} className="text-xs">
          {t("payoutAmount")}
        </Label>
        <Input
          id={`${idPrefix}-pamt`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-8 w-28 text-xs"
        />
      </div>
      <NativeSelect
        aria-label={t("payoutMode")}
        value={mode}
        onChange={(e) => setMode(e.target.value as (typeof PAYMENT_MODES)[number])}
        className="h-8 w-auto text-xs"
      >
        {PAYMENT_MODES.map((m) => (
          <option key={m} value={m}>
            {tModes(m)}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" size="sm" variant="outline" disabled={pending || !amount.trim()} className="h-8">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("recordPayout")}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive w-full text-xs font-medium">
          {tRoot(error)}
        </p>
      ) : null}
    </form>
  );
}

/** Venue address and instructions shown to the staff on the job. */
export function JobDetailsForm({
  jobId,
  bookingItemId,
  reservationId,
  initial,
  idPrefix,
}: {
  jobId?: string;
  bookingItemId?: string;
  reservationId?: string;
  initial: { siteAddress: string; instructions: string };
  idPrefix: string;
}) {
  const t = useTranslations("staff");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [site, setSite] = useState(initial.siteAddress);
  const [notes, setNotes] = useState(initial.instructions);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3"
      aria-label={t("jobDetails")}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          let id = jobId;
          if (!id) {
            const created = await ensureJob({ bookingItemId, reservationId });
            if (!created.ok) return setError(created.error);
            id = created.data;
          }
          const result = await saveJobDetails({ jobId: id, siteAddress: site, instructions: notes });
          if (!result.ok) return setError(result.error);
          toast.success(t("jobDetailsSaved"));
          router.refresh();
        });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-site`}>{t("site")}</Label>
        <Input
          id={`${idPrefix}-site`}
          value={site}
          maxLength={500}
          onChange={(e) => setSite(e.target.value)}
          placeholder={t("sitePlaceholder")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-instr`}>{t("instructions")}</Label>
        <textarea
          id={`${idPrefix}-instr`}
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("instructionsPlaceholder")}
          className="border-input bg-card focus-visible:border-primary focus-visible:ring-ring rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
        />
        <p className="text-muted-foreground text-xs">{t("instructionsHint")}</p>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-xs font-medium">
          {tRoot(error)}
        </p>
      ) : null}
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("saveJobDetails")}
      </Button>
    </form>
  );
}
