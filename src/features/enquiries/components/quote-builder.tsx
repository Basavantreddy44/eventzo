"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { formatPaise, rupeesToPaise } from "@/lib/money";
import { sendQuotation } from "../actions/vendor";
import { computeQuote, percentToBps } from "../lib/quote";
import { quoteSchema, type QuoteInput } from "../schemas";

const textareaClass =
  "border-input bg-card focus-visible:border-primary focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm";

/** Line-item quote with a live total (the database recomputes it authoritatively). */
export function QuoteBuilder({ initial, suggestion }: { initial: QuoteInput; suggestion: string | null }) {
  const t = useTranslations("vendorEnquiries");
  const tQuote = useTranslations("quote");
  const tRoot = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<QuoteInput>({ resolver: zodResolver(quoteSchema), defaultValues: initial });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const { errors } = form.formState;
  const [items, discount, taxPercent] = useWatch({ control: form.control, name: ["items", "discount", "taxPercent"] });

  const paise = (v: string) => Number(rupeesToPaise(v ?? "") ?? 0n);
  const preview = computeQuote(
    (items ?? []).map((i) => ({
      quantity: /^\d+$/.test(i.quantity ?? "") ? Number(i.quantity) : 0,
      unitPricePaise: paise(i.unitPrice),
    })),
    paise(discount),
    percentToBps(taxPercent || "0") ?? 0,
  );

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await sendQuotation(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("quoteSent"));
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("quoteTitle")}>
      <FormError message={formError} />
      {suggestion ? <p className="text-muted-foreground text-xs">{suggestion}</p> : null}
      <div className="grid gap-3">
        {fields.map((field, i) => (
          <div key={field.id} className="grid grid-cols-[1fr_4.5rem_7rem_auto] items-end gap-2">
            <div className="grid gap-1">
              {i === 0 ? <Label htmlFor={`item-${i}-d`}>{t("item")}</Label> : null}
              <Input
                id={`item-${i}-d`}
                aria-label={`${t("item")} ${i + 1}`}
                {...form.register(`items.${i}.description`)}
                aria-invalid={!!errors.items?.[i]?.description}
              />
            </div>
            <div className="grid gap-1">
              {i === 0 ? <Label htmlFor={`item-${i}-q`}>{t("qty")}</Label> : null}
              <Input
                id={`item-${i}-q`}
                aria-label={`${t("qty")} ${i + 1}`}
                inputMode="numeric"
                {...form.register(`items.${i}.quantity`)}
                aria-invalid={!!errors.items?.[i]?.quantity}
              />
            </div>
            <div className="grid gap-1">
              {i === 0 ? <Label htmlFor={`item-${i}-p`}>{t("unitPrice")}</Label> : null}
              <Input
                id={`item-${i}-p`}
                aria-label={`${t("unitPrice")} ${i + 1}`}
                inputMode="decimal"
                {...form.register(`items.${i}.unitPrice`)}
                aria-invalid={!!errors.items?.[i]?.unitPrice}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("removeLine")}
              disabled={fields.length <= 1}
              onClick={() => remove(i)}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
        {errors.items?.message || errors.items?.root?.message ? (
          <p role="alert" className="text-destructive text-xs">
            {tRoot(errors.items?.message ?? errors.items?.root?.message ?? "validation.lineItems")}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => append({ description: "", quantity: "1", unitPrice: "" })}
          disabled={fields.length >= 50}
        >
          <Plus aria-hidden /> {t("addLine")}
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FormField id="q-discount" label={t("discount")} error={errors.discount?.message}>
          <Input inputMode="decimal" {...form.register("discount")} />
        </FormField>
        <FormField id="q-tax" label={t("taxPercent")} error={errors.taxPercent?.message}>
          <Input inputMode="decimal" {...form.register("taxPercent")} />
        </FormField>
        <FormField id="q-valid" label={t("validHours")} error={errors.validHours?.message}>
          <Input inputMode="numeric" {...form.register("validHours")} />
        </FormField>
      </div>
      <FormField id="q-notes" label={t("notes")} error={errors.notes?.message}>
        <textarea rows={2} className={textareaClass} {...form.register("notes")} />
      </FormField>
      <FormField id="q-terms" label={t("terms")} error={errors.terms?.message}>
        <textarea rows={3} className={textareaClass} {...form.register("terms")} />
      </FormField>
      <dl className="bg-muted grid gap-1 rounded-md p-3 text-sm" data-testid="quote-preview">
        <div className="flex justify-between">
          <dt>{tQuote("subtotal")}</dt>
          <dd className="tabular-nums">{formatPaise(BigInt(preview.subtotal))}</dd>
        </div>
        {preview.discount > 0 ? (
          <div className="flex justify-between">
            <dt>{tQuote("discount")}</dt>
            <dd className="tabular-nums">− {formatPaise(BigInt(preview.discount))}</dd>
          </div>
        ) : null}
        {preview.tax > 0 ? (
          <div className="flex justify-between">
            <dt>{tQuote("tax", { percent: (percentToBps(taxPercent || "0") ?? 0) / 100 })}</dt>
            <dd className="tabular-nums">{formatPaise(BigInt(preview.tax))}</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t pt-1 font-semibold">
          <dt>{t("preview")}</dt>
          <dd className="tabular-nums">{formatPaise(BigInt(preview.total))}</dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-xs">{t("quoteHint")}</p>
      <Button type="submit" disabled={pending} className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {pending ? t("sending") : t("sendQuote")}
      </Button>
    </form>
  );
}
