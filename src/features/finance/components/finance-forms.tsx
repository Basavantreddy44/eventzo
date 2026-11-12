"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Loader2, Printer } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { saveExpense } from "../actions";
import { toCsv } from "../lib/finance";
import { EXPENSE_CATEGORIES, expenseSchema, PAYMENT_MODES, type ExpenseInput } from "../schemas";

type Option = { id: string; label: string };

export function ExpenseForm({
  branches,
  defaultBranchId,
  allowBusinessWide,
  today,
}: {
  branches: Option[];
  defaultBranchId: string;
  allowBusinessWide: boolean;
  today: string;
}) {
  const t = useTranslations("finance");
  const tCommon = useTranslations("common");
  const tModes = useTranslations("bookings.modes");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fresh = (): ExpenseInput => ({
    category: "materials",
    amount: "",
    spentOn: today,
    payee: "",
    mode: "cash",
    reference: "",
    note: "",
    branchId: defaultBranchId,
    bookingItemId: "",
    idempotencyKey: crypto.randomUUID(),
  });
  const form = useForm<ExpenseInput>({ resolver: zodResolver(expenseSchema), defaultValues: fresh() });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveExpense(values);
      if (!result.ok) {
        setFormError(result.fieldErrors ? null : result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("expenseSaved"));
      form.reset(fresh());
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("addExpense")}>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <FormField id="ex-cat" label={t("category")} error={errors.category?.message}>
          <NativeSelect {...form.register("category")}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="ex-amount" label={t("amount")} error={errors.amount?.message}>
          <Input inputMode="decimal" placeholder="2500" {...form.register("amount")} />
        </FormField>
        <FormField id="ex-date" label={t("spentOn")} error={errors.spentOn?.message}>
          <Input type="date" {...form.register("spentOn")} />
        </FormField>
        <FormField id="ex-mode" label={t("mode")} error={errors.mode?.message}>
          <NativeSelect {...form.register("mode")}>
            <option value="">{t("modeUnknown")}</option>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {tModes(m)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="ex-payee" label={t("payee")} optionalLabel={tCommon("optional")} error={errors.payee?.message}>
          <Input placeholder={t("payeePlaceholder")} {...form.register("payee")} />
        </FormField>
        <FormField
          id="ex-ref"
          label={t("reference")}
          optionalLabel={tCommon("optional")}
          error={errors.reference?.message}
        >
          <Input placeholder={t("referencePlaceholder")} {...form.register("reference")} />
        </FormField>
        {branches.length > 1 || !allowBusinessWide ? (
          <FormField id="ex-branch" label={t("branch")} error={errors.branchId?.message}>
            <NativeSelect {...form.register("branchId")}>
              {allowBusinessWide ? <option value="">{t("wholeBusiness")}</option> : null}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        ) : null}
        <FormField id="ex-note" label={t("note")} optionalLabel={tCommon("optional")} error={errors.note?.message}>
          <Input {...form.register("note")} />
        </FormField>
      </div>
      <Button type="submit" disabled={pending} className="sm:justify-self-start" data-testid="save-expense">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("addExpense")}
      </Button>
    </form>
  );
}

/** Downloads rows as a CSV file (built in the browser from data already on the page). */
export function CsvButton({
  filename,
  rows,
  label,
}: {
  filename: string;
  rows: (string | number | null)[][];
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={rows.length <= 1}
      onClick={() => {
        // BOM so Excel opens ₹ and Indian names as UTF-8.
        const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      <Download aria-hidden />
      {label}
    </Button>
  );
}

export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden" data-testid="print-receipt">
      <Printer aria-hidden />
      {label}
    </Button>
  );
}
