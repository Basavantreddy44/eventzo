"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { saveListing } from "../actions/listings";
import { listingSchema, type ListingInput } from "../schemas";

type Option = { id: string; label: string };
type CategoryOption = Option & { businessSlug: string; group: string };

const textareaClass =
  "border-input bg-card focus-visible:border-primary focus-visible:ring-ring aria-invalid:border-destructive w-full rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm";
const PRICE_UNITS = ["per_event", "per_day", "per_plate", "per_person", "per_hour", "per_session"] as const;
const POLICIES = ["in_house_only", "outside_allowed", "both"] as const;

export function ListingForm({
  initial,
  categories,
  cities,
  areas,
  branches,
}: {
  initial: ListingInput;
  categories: CategoryOption[];
  cities: Option[];
  areas: (Option & { cityId: string })[];
  branches: Option[];
}) {
  const t = useTranslations("vendor.listings");
  const tListing = useTranslations("listing");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<ListingInput>({ resolver: zodResolver(listingSchema), defaultValues: initial });
  const { errors, isDirty } = form.formState;
  const [categoryId, cityId, priceType, cancellationPolicy] = useWatch({
    control: form.control,
    name: ["serviceCategoryId", "cityId", "priceType", "cancellationPolicy"],
  });
  const businessSlug = categories.find((c) => c.id === categoryId)?.businessSlug;
  const editing = !!initial.id;
  const groups = [...new Set(categories.map((c) => c.group))];

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveListing({
        ...values,
        venue: businessSlug === "venues" ? values.venue : undefined,
        catering: businessSlug === "catering" ? values.catering : undefined,
      });
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      form.reset(values);
      if (editing) {
        toast.success(t("saved"));
        router.refresh();
      } else {
        toast.success(t("created"));
        router.replace(`/vendor/listings/${result.data}`);
      }
    });
  });

  const yesNo = (name: "venue.airConditioned" | "venue.alcoholAllowed") => (
    <NativeSelect {...form.register(name)}>
      <option value="">{t("notSpecified")}</option>
      <option value="yes">{tListing("yes")}</option>
      <option value="no">{tListing("no")}</option>
    </NativeSelect>
  );
  const policySelect = (name: "venue.cateringPolicy" | "venue.decorPolicy") => (
    <NativeSelect {...form.register(name)}>
      <option value="">{t("notSpecified")}</option>
      {POLICIES.map((p) => (
        <option key={p} value={p}>
          {tListing(`policy.${p}`)}
        </option>
      ))}
    </NativeSelect>
  );

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-8"
      aria-label={editing ? t("formTitleEdit") : t("formTitleNew")}
    >
      <FormError message={formError} />

      <section className="grid gap-4">
        <h2 className="font-semibold">{t("sectionBasics")}</h2>
        <FormField id="serviceCategoryId" label={t("category")} error={errors.serviceCategoryId?.message}>
          <NativeSelect {...form.register("serviceCategoryId")}>
            <option value="">{t("categoryPlaceholder")}</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {categories
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="title" label={t("titleLabel")} error={errors.title?.message}>
          <Input placeholder={t("titlePlaceholder")} {...form.register("title")} />
        </FormField>
        <FormField
          id="summary"
          label={t("summary")}
          hint={t("summaryHint")}
          optionalLabel={tCommon("optional")}
          error={errors.summary?.message}
        >
          <Input maxLength={300} {...form.register("summary")} />
        </FormField>
        <FormField
          id="description"
          label={t("description")}
          optionalLabel={tCommon("optional")}
          error={errors.description?.message}
        >
          <textarea rows={5} className={textareaClass} {...form.register("description")} />
        </FormField>
        <FormField id="bookingMode" label={t("bookingMode")} error={errors.bookingMode?.message}>
          <NativeSelect {...form.register("bookingMode")}>
            <option value="request">{t("bookingModes.request")}</option>
            <option value="instant">{t("bookingModes.instant")}</option>
          </NativeSelect>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="branchId" label={t("branch")} error={errors.branchId?.message}>
            <NativeSelect {...form.register("branchId")}>
              <option value="">{t("noBranch")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="cityId" label={t("city")} error={errors.cityId?.message}>
            <NativeSelect {...form.register("cityId", { onChange: () => form.setValue("areaId", "") })}>
              <option value="">—</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="areaId" label={t("area")} optionalLabel={tCommon("optional")} error={errors.areaId?.message}>
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
      </section>

      <section className="grid gap-4">
        <h2 className="font-semibold">{t("sectionPricing")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="priceType" label={t("priceType")} error={errors.priceType?.message}>
            <NativeSelect {...form.register("priceType")}>
              {(["starting_from", "fixed", "range", "on_request"] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`priceTypes.${p}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {priceType !== "on_request" ? (
            <FormField id="priceUnit" label={t("priceUnit")} error={errors.priceUnit?.message}>
              <NativeSelect {...form.register("priceUnit")}>
                <option value="">—</option>
                {PRICE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t(`priceUnits.${u}`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : null}
          {priceType !== "on_request" ? (
            <FormField id="base" label={t("base")} error={errors.base?.message}>
              <Input inputMode="decimal" {...form.register("base")} />
            </FormField>
          ) : null}
          {priceType === "range" ? (
            <FormField id="max" label={t("max")} error={errors.max?.message}>
              <Input inputMode="decimal" {...form.register("max")} />
            </FormField>
          ) : null}
          <FormField
            id="auspiciousSurcharge"
            label={t("auspiciousSurcharge")}
            hint={t("auspiciousSurchargeHint")}
            optionalLabel={tCommon("optional")}
            error={errors.auspiciousSurcharge?.message}
          >
            <Input inputMode="decimal" placeholder="0" {...form.register("auspiciousSurcharge")} />
          </FormField>
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="font-semibold">{t("sectionBookingTerms")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="advancePercent"
            label={t("advancePercent")}
            hint={t("advancePercentHint")}
            error={errors.advancePercent?.message}
          >
            <Input inputMode="numeric" {...form.register("advancePercent")} />
          </FormField>
          <FormField
            id="cancellationPolicy"
            label={t("cancellationPolicy")}
            hint={t(`policyHints.${cancellationPolicy}`)}
            error={errors.cancellationPolicy?.message}
          >
            <NativeSelect {...form.register("cancellationPolicy")}>
              {(["flexible", "moderate", "strict"] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`policies.${p}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="font-semibold">{t("sectionGuests")}</h2>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            id="minGuests"
            label={t("minGuests")}
            optionalLabel={tCommon("optional")}
            error={errors.minGuests?.message}
          >
            <Input inputMode="numeric" {...form.register("minGuests")} />
          </FormField>
          <FormField
            id="maxGuests"
            label={t("maxGuests")}
            optionalLabel={tCommon("optional")}
            error={errors.maxGuests?.message}
          >
            <Input inputMode="numeric" {...form.register("maxGuests")} />
          </FormField>
        </div>
      </section>

      {businessSlug === "venues" ? (
        <section className="grid gap-4" data-testid="venue-section">
          <h2 className="font-semibold">{t("sectionVenue")}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <FormField id="venue.seated" label={t("seated")} error={errors.venue?.seated?.message}>
              <Input inputMode="numeric" {...form.register("venue.seated")} />
            </FormField>
            <FormField id="venue.floating" label={t("floating")} error={errors.venue?.floating?.message}>
              <Input inputMode="numeric" {...form.register("venue.floating")} />
            </FormField>
            <FormField id="venue.dining" label={t("dining")} error={errors.venue?.dining?.message}>
              <Input inputMode="numeric" {...form.register("venue.dining")} />
            </FormField>
            <FormField id="venue.rooms" label={t("rooms")} error={errors.venue?.rooms?.message}>
              <Input inputMode="numeric" {...form.register("venue.rooms")} />
            </FormField>
            <FormField id="venue.parking" label={t("parking")} error={errors.venue?.parking?.message}>
              <Input inputMode="numeric" {...form.register("venue.parking")} />
            </FormField>
            <FormField id="venue.areaSqft" label={t("areaSqft")} error={errors.venue?.areaSqft?.message}>
              <Input inputMode="numeric" {...form.register("venue.areaSqft")} />
            </FormField>
            <FormField id="venue.airConditioned" label={t("airConditioned")}>
              {yesNo("venue.airConditioned")}
            </FormField>
            <FormField id="venue.alcoholAllowed" label={t("alcohol")}>
              {yesNo("venue.alcoholAllowed")}
            </FormField>
            <FormField id="venue.cateringPolicy" label={t("cateringPolicy")}>
              {policySelect("venue.cateringPolicy")}
            </FormField>
            <FormField id="venue.decorPolicy" label={t("decorPolicy")}>
              {policySelect("venue.decorPolicy")}
            </FormField>
          </div>
        </section>
      ) : null}

      {businessSlug === "catering" ? (
        <section className="grid gap-4" data-testid="catering-section">
          <h2 className="font-semibold">{t("sectionCatering")}</h2>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="catering.vegPlate" label={t("vegPlate")} error={errors.catering?.vegPlate?.message}>
              <Input inputMode="decimal" {...form.register("catering.vegPlate")} />
            </FormField>
            <FormField id="catering.nonvegPlate" label={t("nonvegPlate")} error={errors.catering?.nonvegPlate?.message}>
              <Input inputMode="decimal" {...form.register("catering.nonvegPlate")} />
            </FormField>
            <FormField id="catering.minPlates" label={t("minPlates")} error={errors.catering?.minPlates?.message}>
              <Input inputMode="numeric" {...form.register("catering.minPlates")} />
            </FormField>
            <FormField id="catering.maxPlates" label={t("maxPlates")} error={errors.catering?.maxPlates?.message}>
              <Input inputMode="numeric" {...form.register("catering.maxPlates")} />
            </FormField>
          </div>
          <FormField
            id="catering.cuisines"
            label={t("cuisines")}
            hint={t("cuisinesHint")}
            error={errors.catering?.cuisines?.message}
          >
            <Input {...form.register("catering.cuisines")} />
          </FormField>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-primary size-4" {...form.register("catering.liveCounters")} />
              {t("liveCounters")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-primary size-4" {...form.register("catering.staffIncluded")} />
              {t("staffIncluded")}
            </label>
          </div>
        </section>
      ) : null}

      <Button type="submit" size="lg" disabled={pending || (editing && !isDirty)} className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? tCommon("saving") : t("save")}
      </Button>
    </form>
  );
}
