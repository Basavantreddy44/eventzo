"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setFollowUp } from "../actions/vendor";

type DynamicT = (key: string) => string;

/** Roadmap V8: a follow-up date for a lead; the vendor is reminded that morning. */
export function FollowUpForm({
  enquiryId,
  initialDate,
  initialNote,
  today,
}: {
  enquiryId: string;
  initialDate: string | null;
  initialNote: string | null;
  today: string;
}) {
  const t = useTranslations("vendorEnquiries.followUp");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [date, setDate] = useState(initialDate ?? "");
  const [note, setNote] = useState(initialNote ?? "");
  const [pending, startTransition] = useTransition();

  const save = (on: string | null) =>
    startTransition(async () => {
      const result = await setFollowUp(enquiryId, on, on ? note : "");
      if (!result.ok) {
        toast.error(tRoot(result.error));
        return;
      }
      toast.success(on ? t("saved") : t("cleared"));
      if (!on) {
        setDate("");
        setNote("");
      }
      router.refresh();
    });

  return (
    <form
      className="grid gap-2"
      data-testid="follow-up-form"
      onSubmit={(e) => {
        e.preventDefault();
        save(date || null);
      }}
    >
      <label htmlFor={`fu-date-${uid}`} className="text-sm font-medium">
        {t("date")}
      </label>
      <Input id={`fu-date-${uid}`} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      <label htmlFor={`fu-note-${uid}`} className="text-sm font-medium">
        {t("note")}
      </label>
      <Input
        id={`fu-note-${uid}`}
        value={note}
        maxLength={300}
        placeholder={t("notePlaceholder")}
        onChange={(e) => setNote(e.target.value)}
      />
      <p className="text-muted-foreground text-xs">{t("hint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending || !date}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <BellRing aria-hidden />}
          {t("save")}
        </Button>
        {initialDate ? (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => save(null)}>
            {t("clear")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
