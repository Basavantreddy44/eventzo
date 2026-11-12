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
import { recordOfflinePayment } from "../actions/vendor";
import { OFFLINE_MODES, offlinePaymentSchema, type OfflinePaymentInput } from "../schemas";

/** Vendor records money received outside the platform (cash, UPI, bank transfer, cheque). */
export function OfflinePaymentForm({ itemId, suggestedRupees }: { itemId: string; suggestedRupees: string }) {
  const t = useTranslations("vendorBookings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fresh = (): OfflinePaymentInput => ({
    itemId,
    amount: suggestedRupees,
    mode: "upi",
    reference: "",
    note: "",
    idempotencyKey: crypto.randomUUID(),
  });
  const form = useForm<OfflinePaymentInput>({ resolver: zodResolver(offlinePaymentSchema), defaultValues: fresh() });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await recordOfflinePayment(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("paymentRecorded"));
      form.reset({ ...fresh(), amount: "" });
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("recordTitle")}>
      <FormError message={formError} />
      <div className="grid grid-cols-2 gap-3">
        <FormField id="off-amount" label={t("amount")} error={errors.amount?.message}>
          <Input inputMode="decimal" {...form.register("amount")} />
        </FormField>
        <FormField id="off-mode" label={t("mode")} error={errors.mode?.message}>
          <NativeSelect {...form.register("mode")}>
            {OFFLINE_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`modes.${m}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField
        id="off-reference"
        label={t("reference")}
        optionalLabel={tCommon("optional")}
        error={errors.reference?.message}
      >
        <Input placeholder={t("referencePlaceholder")} {...form.register("reference")} />
      </FormField>
      <FormField id="off-note" label={t("note")} optionalLabel={tCommon("optional")} error={errors.note?.message}>
        <Input {...form.register("note")} />
      </FormField>
      <Button type="submit" disabled={pending} className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? tCommon("saving") : t("record")}
      </Button>
    </form>
  );
}
