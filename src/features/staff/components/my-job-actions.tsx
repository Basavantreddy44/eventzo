"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, WifiOff } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { respondJob } from "../actions";
import type { JobAction } from "../schemas";

type DynamicT = (key: string) => string;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

/** Accept / decline / check in / complete. Disabled without a connection. */
export function MyJobActions({ assignmentId, actions }: { assignmentId: string; actions: JobAction[] }) {
  const t = useTranslations("jobs");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const online = useOnline();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  if (actions.length === 0) return null;

  const run = (action: JobAction, withNote = "") =>
    new Promise<void>((resolve) =>
      startTransition(async () => {
        const result = await respondJob({ assignmentId, action, note: withNote });
        if (!result.ok) toast.error(tRoot(result.error));
        else {
          toast.success(t(`done.${action}`));
          router.refresh();
        }
        resolve();
      }),
    );

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {actions
          .filter((a) => a !== "decline")
          .map((a) => (
            <Button
              key={a}
              size="lg"
              className="min-h-11 flex-1 sm:flex-none"
              disabled={pending || !online}
              onClick={() => void run(a)}
              data-testid={`job-${a}`}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t(`actions.${a}`)}
            </Button>
          ))}
        {actions.includes("decline") ? (
          <ConfirmDialog
            destructive
            title={t("declineTitle")}
            description={t("declineBody")}
            confirmLabel={t("actions.decline")}
            cancelLabel={tCommon("cancel")}
            trigger={
              <Button
                size="lg"
                variant="outline"
                className="min-h-11 flex-1 sm:flex-none"
                disabled={pending || !online}
                data-testid="job-decline"
              >
                {t("actions.decline")}
              </Button>
            }
            onConfirm={() => run("decline", note)}
          >
            <label className="grid gap-1 text-sm">
              {t("declineReason")}
              <input
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                className="border-input bg-card rounded-md border px-3 py-2"
              />
            </label>
          </ConfirmDialog>
        ) : null}
      </div>
      {!online ? <p className="text-muted-foreground text-xs">{t("needsConnection")}</p> : null}
    </div>
  );
}

/** "Offline – showing the copy saved at 09:12" banner + last-updated time. */
export function OfflineBanner({ renderedAt, timeLabel }: { renderedAt: string; timeLabel: string }) {
  const t = useTranslations("jobs");
  const online = useOnline();
  return (
    <div className="grid gap-1" role="status" aria-live="polite">
      {!online ? (
        <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          {t("offline", { time: timeLabel })}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs" data-rendered-at={renderedAt}>
        {t("updatedAt", { time: timeLabel })}
      </p>
    </div>
  );
}

/**
 * Registers the staff-app service worker (production builds only: in dev it
 * would cache hot-reloaded chunks). The worker keeps an offline copy of this
 * page and the static assets it needs.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Not fatal: the page works online without it.
    });
  }, []);
  return null;
}
