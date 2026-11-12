"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form/form-field";
import { respondRsvp } from "../actions/rsvp";
import { RSVP_CHOICES } from "../schemas";

type Choice = (typeof RSVP_CHOICES)[number];
type DynamicT = (key: string) => string;

/** Public RSVP from a guest's private link. */
export function RsvpForm({
  token,
  partySize,
  initial,
}: {
  token: string;
  partySize: number;
  initial: { status: string; count: number; note: string };
}) {
  const t = useTranslations("rsvp");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [status, setStatus] = useState<Choice | "">(
    (RSVP_CHOICES as readonly string[]).includes(initial.status) ? (initial.status as Choice) : "",
  );
  const [count, setCount] = useState(String(initial.count > 0 ? initial.count : partySize));
  const [note, setNote] = useState(initial.note);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const needsCount = status === "attending" || status === "maybe";

  return (
    <form
      noValidate
      className="grid gap-5"
      aria-label={t("formTitle")}
      onSubmit={(e) => {
        e.preventDefault();
        if (!status) return setError("validation.required");
        setError(null);
        startTransition(async () => {
          const n = Number(count);
          const result = await respondRsvp({
            token,
            status,
            count: needsCount && Number.isInteger(n) ? n : 0,
            note: note.trim(),
          });
          if (!result.ok) return setError(result.fieldErrors?.count ?? result.error);
          setDone(true);
          router.refresh();
        });
      }}
    >
      <FormError message={error} />
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("question")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {RSVP_CHOICES.map((c) => (
            <label
              key={c}
              className="has-checked:border-primary has-checked:bg-accent flex cursor-pointer items-center gap-2 rounded-md border px-3 py-3 text-sm"
            >
              <input
                type="radio"
                name="rsvp"
                value={c}
                checked={status === c}
                onChange={() => {
                  setStatus(c);
                  setDone(false);
                }}
                className="accent-primary size-4"
                data-testid={`rsvp-${c}`}
              />
              {t(`choices.${c}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {needsCount ? (
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="rsvp-count">{t("howMany", { max: partySize })}</Label>
          <Input
            id="rsvp-count"
            type="number"
            min={status === "attending" ? 1 : 0}
            max={partySize}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="rsvp-note">
          {t("note")} <span className="text-muted-foreground font-normal">({tRoot("common.optional")})</span>
        </Label>
        <textarea
          id="rsvp-note"
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="border-input bg-card focus-visible:border-primary focus-visible:ring-ring rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
        />
      </div>
      <Button type="submit" disabled={pending} className="sm:justify-self-start" data-testid="rsvp-submit">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("send")}
      </Button>
      {done ? (
        <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400" data-testid="rsvp-done">
          {t("thanks")}
        </p>
      ) : null}
    </form>
  );
}
