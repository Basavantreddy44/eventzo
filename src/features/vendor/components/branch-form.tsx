"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { saveBranch } from "../actions/branches";
import { branchSchema, type BranchInput } from "../schemas";

type Option = { id: string; label: string };

const EMPTY: BranchInput = {
  name: "",
  cityId: "",
  areaId: "",
  addressLine1: "",
  addressLine2: "",
  pincode: "",
  phone: "",
};

export function BranchForm({
  cities,
  areas,
  initial,
}: {
  cities: Option[];
  areas: (Option & { cityId: string })[];
  initial?: BranchInput;
}) {
  const t = useTranslations("vendor.branches");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<BranchInput>({ resolver: zodResolver(branchSchema), defaultValues: initial ?? EMPTY });
  const { errors } = form.formState;
  const cityId = useWatch({ control: form.control, name: "cityId" });
  const editing = !!initial?.id;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveBranch(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("saved"));
      form.reset(EMPTY);
      router.replace("/vendor/branches");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={editing ? t("formEdit") : t("formNew")}>
      <FormError message={formError} />
      <FormField id="branch-name" label={t("name")} error={errors.name?.message}>
        <Input {...form.register("name")} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="branch-city" label={t("city")} error={errors.cityId?.message}>
          <NativeSelect {...form.register("cityId", { onChange: () => form.setValue("areaId", "") })}>
            <option value="">—</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          id="branch-area"
          label={t("area")}
          optionalLabel={tCommon("optional")}
          error={errors.areaId?.message}
        >
          <NativeSelect {...form.register("areaId")} disabled={!cityId}>
            <option value="">{t("noArea")}</option>
            {areas
              .filter((a) => a.cityId === cityId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField
        id="branch-address1"
        label={t("address1")}
        optionalLabel={tCommon("optional")}
        error={errors.addressLine1?.message}
      >
        <Input autoComplete="address-line1" {...form.register("addressLine1")} />
      </FormField>
      <FormField
        id="branch-address2"
        label={t("address2")}
        optionalLabel={tCommon("optional")}
        error={errors.addressLine2?.message}
      >
        <Input autoComplete="address-line2" {...form.register("addressLine2")} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          id="branch-pincode"
          label={t("pincode")}
          optionalLabel={tCommon("optional")}
          error={errors.pincode?.message}
        >
          <Input inputMode="numeric" maxLength={6} autoComplete="postal-code" {...form.register("pincode")} />
        </FormField>
        <FormField
          id="branch-phone"
          label={t("phone")}
          optionalLabel={tCommon("optional")}
          error={errors.phone?.message}
        >
          <Input type="tel" inputMode="tel" {...form.register("phone")} />
        </FormField>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? tCommon("saving") : t("save")}
        </Button>
        {editing ? (
          <Link href="/vendor/branches" className="text-primary text-sm underline-offset-4 hover:underline">
            {tCommon("cancel")}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
