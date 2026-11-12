"use client";

import { useState, useTransition } from "react";
import { useForm, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import type { ActionResult } from "@/lib/errors";
import { saveArea, saveCategory, saveCity, saveServiceCategory } from "../actions";
import {
  areaSchema,
  categorySchema,
  citySchema,
  serviceCategorySchema,
  slugify,
  type AreaInput,
  type CategoryInput,
  type CityInput,
  type ServiceCategoryInput,
  type TaxonomyKind,
} from "../schemas";

type Option = { id: string; label: string };

/** Shared submit/reset logic for the four taxonomy forms. */
function useTaxonomyForm<T extends FieldValues>(
  form: UseFormReturn<T>,
  save: (v: T) => Promise<ActionResult>,
  /** Values after a successful save (a function can keep some of what was entered). */
  empty: T | ((saved: T) => T),
  tab: TaxonomyKind,
) {
  const t = useTranslations("admin.taxonomy");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await save(values);
      if (!result.ok) {
        setFormError(result.fieldErrors ? null : result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("saved"));
      form.reset(typeof empty === "function" ? (empty as (saved: T) => T)(values) : empty);
      router.replace({ pathname: "/admin/taxonomy", query: { tab } });
      router.refresh();
    });
  });
  return { onSubmit, formError, pending };
}

/** Name field that fills the slug while the slug hasn't been typed by hand (new entries only). */
function NameAndSlug<T extends FieldValues>({
  form,
  editing,
  prefix,
}: {
  form: UseFormReturn<T>;
  editing: boolean;
  prefix: string;
}) {
  const t = useTranslations("admin.taxonomy");
  const { errors } = form.formState;
  const nameReg = form.register("name" as Path<T>);
  return (
    <>
      <FormField id={`${prefix}-name`} label={t("name")} error={errors.name?.message as string | undefined}>
        <Input
          {...nameReg}
          onChange={(e) => {
            void nameReg.onChange(e);
            if (!editing && !form.getFieldState("slug" as Path<T>).isDirty) {
              form.setValue("slug" as Path<T>, slugify(e.target.value) as never);
            }
          }}
        />
      </FormField>
      <FormField
        id={`${prefix}-slug`}
        label={t("slug")}
        hint={t("slugHint")}
        error={errors.slug?.message as string | undefined}
      >
        <Input {...form.register("slug" as Path<T>)} readOnly={editing} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id={`${prefix}-kn`} label={t("nameKn")} error={errors.nameKn?.message as string | undefined}>
          <Input lang="kn" {...form.register("nameKn" as Path<T>)} />
        </FormField>
        <FormField id={`${prefix}-hi`} label={t("nameHi")} error={errors.nameHi?.message as string | undefined}>
          <Input lang="hi" {...form.register("nameHi" as Path<T>)} />
        </FormField>
      </div>
    </>
  );
}

function Actions({ pending, editing, tab }: { pending: boolean; editing: boolean; tab: TaxonomyKind }) {
  const t = useTranslations("admin.taxonomy");
  const tCommon = useTranslations("common");
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={pending} data-testid="save-taxonomy">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {editing ? t("saveChanges") : t("add")}
      </Button>
      {editing ? (
        <Button asChild variant="ghost">
          <Link href={{ pathname: "/admin/taxonomy", query: { tab } }}>{tCommon("cancel")}</Link>
        </Button>
      ) : null}
    </div>
  );
}

// ---------- business categories ------------------------------------------------------------------
const EMPTY_CATEGORY: CategoryInput = {
  name: "",
  slug: "",
  nameKn: "",
  nameHi: "",
  description: "",
  icon: "",
  displayOrder: "100",
  isLaunchFocus: false,
};

export function CategoryForm({ initial }: { initial?: CategoryInput }) {
  const t = useTranslations("admin.taxonomy");
  const form = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: initial ?? EMPTY_CATEGORY,
  });
  const { onSubmit, formError, pending } = useTaxonomyForm(form, saveCategory, EMPTY_CATEGORY, "categories");
  const { errors } = form.formState;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("categoryForm")}>
      <FormError message={formError} />
      <NameAndSlug form={form} editing={!!initial?.id} prefix="cat" />
      <FormField id="cat-desc" label={t("description")} error={errors.description?.message}>
        <Input {...form.register("description")} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="cat-icon" label={t("icon")} hint={t("iconHint")} error={errors.icon?.message}>
          <Input placeholder="building-2" {...form.register("icon")} />
        </FormField>
        <FormField id="cat-order" label={t("order")} error={errors.displayOrder?.message}>
          <Input inputMode="numeric" {...form.register("displayOrder")} />
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-primary size-4" {...form.register("isLaunchFocus")} />
        {t("launchFocus")}
      </label>
      <Actions pending={pending} editing={!!initial?.id} tab="categories" />
    </form>
  );
}

// ---------- service categories -------------------------------------------------------------------
export function ServiceCategoryForm({ initial, categories }: { initial?: ServiceCategoryInput; categories: Option[] }) {
  const t = useTranslations("admin.taxonomy");
  const tRes = useTranslations("vendor.resources.kinds");
  const empty: ServiceCategoryInput = {
    businessCategoryId: categories[0]?.id ?? "",
    name: "",
    slug: "",
    nameKn: "",
    nameHi: "",
    description: "",
    defaultBookingMode: "request",
    resourceKindHint: "",
    displayOrder: "100",
  };
  const form = useForm<ServiceCategoryInput>({
    resolver: zodResolver(serviceCategorySchema),
    defaultValues: initial ?? empty,
  });
  const { onSubmit, formError, pending } = useTaxonomyForm(
    form,
    saveServiceCategory,
    (saved) => ({ ...empty, businessCategoryId: saved.businessCategoryId }),
    "services",
  );
  const { errors } = form.formState;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("serviceForm")}>
      <FormError message={formError} />
      <FormField id="svc-parent" label={t("parentCategory")} error={errors.businessCategoryId?.message}>
        <NativeSelect {...form.register("businessCategoryId")}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <NameAndSlug form={form} editing={!!initial?.id} prefix="svc" />
      <FormField id="svc-desc" label={t("description")} error={errors.description?.message}>
        <Input {...form.register("description")} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="svc-mode" label={t("bookingMode")} error={errors.defaultBookingMode?.message}>
          <NativeSelect {...form.register("defaultBookingMode")}>
            <option value="request">{t("modes.request")}</option>
            <option value="instant">{t("modes.instant")}</option>
          </NativeSelect>
        </FormField>
        <FormField id="svc-kind" label={t("resourceHint")} error={errors.resourceKindHint?.message}>
          <NativeSelect {...form.register("resourceKindHint")}>
            <option value="">{t("none")}</option>
            {(["venue_space", "artist", "team", "equipment"] as const).map((k) => (
              <option key={k} value={k}>
                {tRes(k)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField id="svc-order" label={t("order")} error={errors.displayOrder?.message}>
        <Input inputMode="numeric" {...form.register("displayOrder")} />
      </FormField>
      <Actions pending={pending} editing={!!initial?.id} tab="services" />
    </form>
  );
}

// ---------- cities --------------------------------------------------------------------------------
const EMPTY_CITY: CityInput = {
  name: "",
  slug: "",
  nameKn: "",
  nameHi: "",
  state: "Karnataka",
  stateCode: "KA",
  altNames: "",
  isLaunchCity: false,
};

export function CityForm({ initial }: { initial?: CityInput }) {
  const t = useTranslations("admin.taxonomy");
  const form = useForm<CityInput>({ resolver: zodResolver(citySchema), defaultValues: initial ?? EMPTY_CITY });
  const { onSubmit, formError, pending } = useTaxonomyForm(form, saveCity, EMPTY_CITY, "cities");
  const { errors } = form.formState;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("cityForm")}>
      <FormError message={formError} />
      <NameAndSlug form={form} editing={!!initial?.id} prefix="city" />
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <FormField id="city-state" label={t("state")} error={errors.state?.message}>
          <Input {...form.register("state")} />
        </FormField>
        <FormField id="city-code" label={t("stateCode")} error={errors.stateCode?.message}>
          <Input maxLength={2} {...form.register("stateCode")} />
        </FormField>
      </div>
      <FormField id="city-alt" label={t("altNames")} hint={t("altNamesHint")} error={errors.altNames?.message}>
        <Input placeholder="Gulbarga" {...form.register("altNames")} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-primary size-4" {...form.register("isLaunchCity")} />
        {t("launchCity")}
      </label>
      <Actions pending={pending} editing={!!initial?.id} tab="cities" />
    </form>
  );
}

// ---------- areas --------------------------------------------------------------------------------
export function AreaForm({ initial, cities }: { initial?: AreaInput; cities: Option[] }) {
  const t = useTranslations("admin.taxonomy");
  const empty: AreaInput = { cityId: cities[0]?.id ?? "", name: "", slug: "", nameKn: "", nameHi: "", pincode: "" };
  const form = useForm<AreaInput>({ resolver: zodResolver(areaSchema), defaultValues: initial ?? empty });
  const { onSubmit, formError, pending } = useTaxonomyForm(
    form,
    saveArea,
    (saved) => ({ ...empty, cityId: saved.cityId }),
    "areas",
  );
  const { errors } = form.formState;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("areaForm")}>
      <FormError message={formError} />
      <FormField id="area-city" label={t("city")} error={errors.cityId?.message}>
        <NativeSelect {...form.register("cityId")}>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <NameAndSlug form={form} editing={!!initial?.id} prefix="area" />
      <FormField id="area-pin" label={t("pincode")} error={errors.pincode?.message}>
        <Input inputMode="numeric" maxLength={6} {...form.register("pincode")} />
      </FormField>
      <Actions pending={pending} editing={!!initial?.id} tab="areas" />
    </form>
  );
}
