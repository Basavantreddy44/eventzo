"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { setNotificationPreference, setWhatsappConsent } from "../actions";
import {
  defaultChannelEnabled,
  PREFERENCE_CATEGORIES,
  PREFERENCE_CHANNELS,
  type PreferenceCategory,
  type PreferenceChannel,
} from "../lib/templates";

type DynamicT = (key: string) => string;

export function WhatsappOptIn({ phone, optedIn }: { phone: string | null; optedIn: boolean }) {
  const t = useTranslations("notifications");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!phone) {
    return (
      <p className="text-sm" data-testid="whatsapp-needs-phone">
        {t("whatsappNeedsPhone")}{" "}
        <Link href="/account" className="text-primary font-medium underline-offset-4 hover:underline">
          {t("addPhone")}
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm" data-testid="whatsapp-state">
        {optedIn ? t("whatsappOn", { phone }) : t("whatsappOff", { phone })}
      </p>
      <Button
        variant={optedIn ? "outline" : "default"}
        size="sm"
        disabled={pending}
        data-testid="whatsapp-toggle"
        onClick={() =>
          startTransition(async () => {
            const result = await setWhatsappConsent(!optedIn);
            if (!result.ok) return void toast.error(tRoot(result.error));
            toast.success(optedIn ? t("whatsappStopped") : t("whatsappStarted"));
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {optedIn ? t("whatsappStop") : t("whatsappStart")}
      </Button>
    </div>
  );
}

type Pref = { channel: string; category: string; enabled: boolean };

export function PreferenceGrid({ saved, whatsappOn }: { saved: Pref[]; whatsappOn: boolean }) {
  const t = useTranslations("notifications");
  const tRoot = useTranslations() as unknown as DynamicT;
  const [prefs, setOptimistic] = useOptimistic(saved, (state, next: Pref) => [
    ...state.filter((p) => !(p.channel === next.channel && p.category === next.category)),
    next,
  ]);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const enabled = (channel: PreferenceChannel, category: PreferenceCategory) =>
    prefs.find((p) => p.channel === channel && p.category === category)?.enabled ??
    defaultChannelEnabled(channel, category);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("preferencesTitle")}</caption>
        <thead>
          <tr className="text-muted-foreground text-left">
            <th scope="col" className="py-2 pr-4 font-medium">
              {t("category")}
            </th>
            {PREFERENCE_CHANNELS.map((c) => (
              <th key={c} scope="col" className="px-2 py-2 text-center font-medium">
                {t(`channels.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PREFERENCE_CATEGORIES.map((category) => (
            <tr key={category} className="border-t">
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                {t(`categories.${category}`)}
              </th>
              {PREFERENCE_CHANNELS.map((channel) => {
                const on = enabled(channel, category);
                const inert = channel === "whatsapp" && !whatsappOn;
                return (
                  <td key={channel} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      className="accent-primary size-4 disabled:opacity-40"
                      checked={on && !inert}
                      disabled={inert}
                      title={inert ? t("whatsappOffHint") : undefined}
                      aria-label={`${t(`categories.${category}`)} · ${t(`channels.${channel}`)}`}
                      data-testid={`pref-${channel}-${category}`}
                      onChange={(e) => {
                        const next = { channel, category, enabled: e.target.checked };
                        startTransition(async () => {
                          setOptimistic(next);
                          const result = await setNotificationPreference(next);
                          if (!result.ok) toast.error(tRoot(result.error));
                          router.refresh();
                        });
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
