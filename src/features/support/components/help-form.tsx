"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LifeBuoy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form/form-field";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { openSupportTicket } from "../actions";
import { openTicketSchema, slaHours, SUPPORT_TOPICS, type SupportTopic } from "../schemas";

type DynamicT = { (key: string): string; has(key: string): boolean };

/**
 * C10: "Help" on a booking. Pick what is wrong, add a line, and a support
 * request linked to the booking reaches the Eventzo team.
 */
export function HelpForm({ itemId, cancelHint }: { itemId: string | null; cancelHint?: string }) {
  const t = useTranslations("support");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" className="sm:justify-self-start" onClick={() => setOpen(true)} data-testid="help-open">
        <LifeBuoy aria-hidden />
        {t("getHelp")}
      </Button>
    );
  }

  const err = (k: string) =>
    errors[k] ? (tRoot.has(errors[k]) ? tRoot(errors[k]) : tRoot("validation.invalid")) : null;

  return (
    <form
      className="grid gap-3"
      data-testid="help-form"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = openTicketSchema.safeParse({ itemId, topic, body, idempotencyKey: key });
        if (!parsed.success) {
          setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
          return;
        }
        setErrors({});
        startTransition(async () => {
          const result = await openSupportTicket(parsed.data);
          if (!result.ok) {
            setFormError(result.error);
            return;
          }
          toast.success(t("sent"));
          router.push(`/account/support/${result.data}`);
        });
      }}
    >
      <FormError message={formError} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("whatHappened")}</legend>
        {SUPPORT_TOPICS.map((key) => (
          <label
            key={key}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
              topic === key && "border-primary bg-primary/5",
            )}
          >
            <input
              type="radio"
              name={`help-topic-${uid}`}
              value={key}
              checked={topic === key}
              onChange={() => setTopic(key)}
              className="accent-primary"
            />
            {t(`topics.${key}`)}
          </label>
        ))}
        {err("topic") ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {err("topic")}
          </p>
        ) : null}
      </fieldset>
      {topic === "cancel" && cancelHint ? (
        <p className="bg-accent/50 rounded-md p-2 text-xs" data-testid="help-cancel-hint">
          {cancelHint}
        </p>
      ) : null}
      <div className="grid gap-2">
        <label htmlFor={`help-body-${uid}`} className="text-sm font-medium">
          {t("details")}
        </label>
        <textarea
          id={`help-body-${uid}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t("detailsPlaceholder")}
          className="border-input bg-card focus-visible:border-primary focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
        />
        {err("body") ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {err("body")}
          </p>
        ) : null}
      </div>
      {topic ? <p className="text-muted-foreground text-xs">{t("replyWithin", { hours: slaHours(topic) })}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} data-testid="help-submit">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("send")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {tRoot("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
