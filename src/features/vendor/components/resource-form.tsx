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
import { saveResource } from "../actions/resources";
import { resourceSchema, type ResourceInput } from "../schemas";

type Option = { id: string; label: string };

export const EMPTY_RESOURCE: ResourceInput = {
  name: "",
  kind: "venue_space",
  allocationMode: "exclusive",
  capacity: "1",
  serviceId: "",
  branchId: "",
  staffProfileId: "",
  setupBufferMin: "0",
  breakdownBufferMin: "0",
  travelBufferMin: "0",
};

export function ResourceForm({
  initial,
  services,
  branches,
  staff = [],
  defaultBranchId,
}: {
  initial?: ResourceInput;
  services: Option[];
  branches: Option[];
  /** Roster members who can own an artist/team calendar. */
  staff?: Option[];
  defaultBranchId: string;
}) {
  const t = useTranslations("vendor.resources");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const empty = { ...EMPTY_RESOURCE, branchId: defaultBranchId };
  const form = useForm<ResourceInput>({ resolver: zodResolver(resourceSchema), defaultValues: initial ?? empty });
  const { errors } = form.formState;
  const allocation = useWatch({ control: form.control, name: "allocationMode" });
  const kind = useWatch({ control: form.control, name: "kind" });
  const editing = !!initial?.id;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveResource(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("saved"));
      form.reset(empty);
      router.replace("/vendor/resources");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={editing ? t("formEdit") : t("formNew")}>
      <FormError message={formError} />
      <FormField id="res-name" label={t("name")} error={errors.name?.message}>
        <Input placeholder={t("namePlaceholder")} {...form.register("name")} />
      </FormField>
      <FormField id="res-kind" label={t("kind")} error={errors.kind?.message}>
        <NativeSelect {...form.register("kind")}>
          {(["venue_space", "artist", "team", "equipment"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`kinds.${k}`)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="res-allocation" label={t("allocation")} error={errors.allocationMode?.message}>
        <NativeSelect {...form.register("allocationMode")}>
          <option value="exclusive">{t("allocations.exclusive")}</option>
          <option value="capacity">{t("allocations.capacity")}</option>
        </NativeSelect>
      </FormField>
      {allocation === "capacity" ? (
        <FormField id="res-capacity" label={t("capacity")} error={errors.capacity?.message}>
          <Input inputMode="numeric" {...form.register("capacity")} />
        </FormField>
      ) : null}
      <FormField
        id="res-service"
        label={t("service")}
        optionalLabel={tCommon("optional")}
        error={errors.serviceId?.message}
      >
        <NativeSelect {...form.register("serviceId")}>
          <option value="">{t("noService")}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {(kind === "artist" || kind === "team") && staff.length > 0 ? (
        <FormField
          id="res-staff"
          label={t("staffLink")}
          hint={t("staffLinkHint")}
          optionalLabel={tCommon("optional")}
          error={errors.staffProfileId?.message}
        >
          <NativeSelect {...form.register("staffProfileId")}>
            <option value="">{t("noStaffLink")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      ) : null}
      <FormField id="res-branch" label={t("branch")} error={errors.branchId?.message}>
        <NativeSelect {...form.register("branchId")}>
          <option value="">{t("noBranch")}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="grid grid-cols-3 gap-2">
        <FormField id="res-setup" label={t("setup")} error={errors.setupBufferMin?.message}>
          <Input inputMode="numeric" {...form.register("setupBufferMin")} />
        </FormField>
        <FormField id="res-breakdown" label={t("breakdown")} error={errors.breakdownBufferMin?.message}>
          <Input inputMode="numeric" {...form.register("breakdownBufferMin")} />
        </FormField>
        <FormField id="res-travel" label={t("travel")} error={errors.travelBufferMin?.message}>
          <Input inputMode="numeric" {...form.register("travelBufferMin")} />
        </FormField>
      </div>
      <p className="text-muted-foreground text-xs">{t("buffersHint")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? tCommon("saving") : t("save")}
        </Button>
        {editing ? (
          <Link href="/vendor/resources" className="text-primary text-sm underline-offset-4 hover:underline">
            {tCommon("cancel")}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
