"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link2, Loader2, MessageCircle, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError, FormField } from "@/components/form/form-field";
import { applyServerFieldErrors } from "@/components/form/apply-server-errors";
import { addGuest, addGuestsBulk, deleteGuest, getGuestInviteLink, markGuestInvited, setGuestRsvp } from "../actions";
import { whatsappShareUrl } from "../lib/guests";
import { guestSchema, MAX_BULK_GUESTS, RSVP_CHOICES, type GuestInput } from "../schemas";

type DynamicT = (key: string) => string;

export function AddGuestForm({ eventId }: { eventId: string }) {
  const t = useTranslations("events.guests");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fresh = (group = ""): GuestInput => ({
    eventId,
    name: "",
    phone: "",
    email: "",
    groupLabel: group,
    partySize: "1",
  });
  const form = useForm<GuestInput>({ resolver: zodResolver(guestSchema), defaultValues: fresh() });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await addGuest(values);
      if (!result.ok) {
        setFormError(result.error);
        applyServerFieldErrors(form.setError, result.fieldErrors);
        return;
      }
      toast.success(t("added"));
      form.reset(fresh(values.groupLabel)); // keep the group for the next entry
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3" aria-label={t("addTitle")}>
      <FormError message={formError} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="g-name" label={t("name")} error={errors.name?.message}>
          <Input autoComplete="off" {...form.register("name")} />
        </FormField>
        <FormField id="g-phone" label={t("phone")} optionalLabel={tCommon("optional")} error={errors.phone?.message}>
          <Input inputMode="tel" placeholder="98450 12345" {...form.register("phone")} />
        </FormField>
        <FormField
          id="g-group"
          label={t("group")}
          optionalLabel={tCommon("optional")}
          error={errors.groupLabel?.message}
        >
          <Input placeholder={t("groupPlaceholder")} {...form.register("groupLabel")} />
        </FormField>
        <FormField id="g-size" label={t("partySize")} hint={t("partySizeHint")} error={errors.partySize?.message}>
          <Input inputMode="numeric" {...form.register("partySize")} />
        </FormField>
      </div>
      <Button type="submit" disabled={pending} className="sm:justify-self-start" data-testid="add-guest">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("add")}
      </Button>
    </form>
  );
}

export function BulkGuestsForm({ eventId }: { eventId: string }) {
  const t = useTranslations("events.guests");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [text, setText] = useState("");
  const [group, setGroup] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3"
      aria-label={t("bulkTitle")}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await addGuestsBulk(eventId, text, group);
          if (!result.ok) {
            setError(result.fieldErrors?.text ?? result.fieldErrors?.groupLabel ?? result.error);
            return;
          }
          toast.success(t("bulkAdded", { count: result.data }));
          setText("");
          router.refresh();
        });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="g-bulk">{t("bulkLabel")}</Label>
        <textarea
          id="g-bulk"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Kamala Patil, 98450 12345, 2\nSuresh Kulkarni, 3"}
          aria-describedby="g-bulk-hint"
          aria-invalid={!!error || undefined}
          className="border-input bg-card focus-visible:border-primary focus-visible:ring-ring rounded-md border px-3 py-2 font-mono text-sm shadow-xs outline-none focus-visible:ring-[3px]"
        />
        <p id="g-bulk-hint" className="text-muted-foreground text-xs">
          {t("bulkHint", { max: MAX_BULK_GUESTS })}
        </p>
        {error ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {tRoot(error)}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="g-bulk-group">
          {t("group")} <span className="text-muted-foreground font-normal">({tCommon("optional")})</span>
        </Label>
        <Input id="g-bulk-group" value={group} onChange={(e) => setGroup(e.target.value)} />
      </div>
      <Button type="submit" variant="outline" disabled={pending || !text.trim()} className="sm:justify-self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("bulkAdd")}
      </Button>
    </form>
  );
}

/** Copy / WhatsApp the guest's private RSVP link, regenerate it, or remove the guest. */
export function GuestActions({
  guest,
  shareText,
}: {
  guest: { id: string; name: string; phone: string | null };
  /** Message with a {link} placeholder, already translated with the guest/event names. */
  shareText: string;
}) {
  const t = useTranslations("events.guests");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const copy = () =>
    startTransition(async () => {
      const result = await getGuestInviteLink(guest.id);
      if (!result.ok) return void toast.error(tRoot(result.error));
      try {
        await navigator.clipboard.writeText(result.data);
        toast.success(t("linkCopied"));
      } catch {
        // Clipboard blocked (e.g. insecure context): show the link so it can be copied by hand.
        toast.message(result.data);
      }
      await markGuestInvited(guest.id);
      router.refresh();
    });

  const whatsapp = () => {
    // Open the window synchronously (popup blockers), then point it at wa.me.
    const win = window.open("about:blank", "_blank");
    startTransition(async () => {
      const result = await getGuestInviteLink(guest.id);
      if (!result.ok) {
        win?.close();
        return void toast.error(tRoot(result.error));
      }
      const url = whatsappShareUrl(guest.phone, shareText.replace("{link}", result.data));
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else {
        window.location.href = url;
      }
      await markGuestInvited(guest.id);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={whatsapp} data-testid="guest-whatsapp">
        <MessageCircle aria-hidden />
        <span className="sr-only sm:not-sr-only">{t("whatsapp")}</span>
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={copy} data-testid="guest-copy-link">
        <Link2 aria-hidden />
        <span className="sr-only sm:not-sr-only">{t("copyLink")}</span>
      </Button>
      <ConfirmDialog
        title={t("regenerateTitle")}
        description={t("regenerateBody", { name: guest.name })}
        confirmLabel={t("regenerate")}
        cancelLabel={tCommon("cancel")}
        trigger={
          <Button size="sm" variant="ghost" aria-label={t("regenerate")}>
            <RefreshCw aria-hidden />
          </Button>
        }
        onConfirm={async () => {
          const result = await getGuestInviteLink(guest.id, true);
          if (!result.ok) return void toast.error(tRoot(result.error));
          toast.success(t("regenerated"));
        }}
      />
      <ConfirmDialog
        destructive
        title={t("removeTitle")}
        description={t("removeBody", { name: guest.name })}
        confirmLabel={t("remove")}
        cancelLabel={tCommon("cancel")}
        trigger={
          <Button size="sm" variant="ghost" aria-label={t("remove")}>
            <Trash2 aria-hidden />
          </Button>
        }
        onConfirm={async () => {
          const result = await deleteGuest(guest.id);
          if (!result.ok) return void toast.error(tRoot(result.error));
          toast.success(t("removed"));
          router.refresh();
        }}
      />
    </div>
  );
}

/** Host records an RSVP received by phone / in person. */
export function HostRsvpForm({
  guestId,
  partySize,
  status,
  count,
}: {
  guestId: string;
  partySize: number;
  status: string;
  count: number;
}) {
  const t = useTranslations("events.guests");
  const tRsvp = useTranslations("rsvp");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [people, setPeople] = useState(String(Math.max(count, status === "pending" ? 1 : count)));
  const [pending, startTransition] = useTransition();
  const needsCount = value === "attending" || value === "maybe";

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-2"
      aria-label={t("setRsvp")}
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const n = needsCount ? Number(people) : 0;
          const result = await setGuestRsvp({
            guestId,
            status: value as "pending",
            count: Number.isFinite(n) ? n : 0,
          });
          if (!result.ok) return void toast.error(tRoot(result.fieldErrors?.count ?? result.error));
          toast.success(t("rsvpSaved"));
          router.refresh();
        });
      }}
    >
      <NativeSelect
        aria-label={t("rsvp")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-auto text-xs"
      >
        <option value="pending">{tRsvp("pending")}</option>
        {RSVP_CHOICES.map((c) => (
          <option key={c} value={c}>
            {tRsvp(c)}
          </option>
        ))}
      </NativeSelect>
      {needsCount ? (
        <Input
          aria-label={t("people")}
          type="number"
          min={value === "attending" ? 1 : 0}
          max={partySize}
          value={people}
          onChange={(e) => setPeople(e.target.value)}
          className="h-8 w-16 text-xs"
        />
      ) : null}
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-8">
        {t("saveRsvp")}
      </Button>
    </form>
  );
}
