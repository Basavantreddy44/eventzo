"use client";

import { useTransition } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markNotificationsRead } from "../actions";

export type NotificationView = { id: string; text: string; time: string; link: string | null; unread: boolean };

type DynamicT = (key: string) => string;

export function NotificationList({ items }: { items: NotificationView[] }) {
  const t = useTranslations("notifications");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const nextRouter = useNextRouter();
  const [pending, startTransition] = useTransition();
  const unread = items.filter((i) => i.unread).map((i) => i.id);

  return (
    <div className="grid gap-3">
      {unread.length > 0 ? (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-end"
          disabled={pending}
          data-testid="mark-all-read"
          onClick={() =>
            startTransition(async () => {
              const result = await markNotificationsRead();
              if (!result.ok) return void toast.error(tRoot(result.error));
              nextRouter.refresh();
            })
          }
        >
          {t("markAllRead")}
        </Button>
      ) : null}
      <ul className="bg-card divide-y rounded-lg border" data-testid="notifications">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={cn(
                "hover:bg-accent/60 flex w-full items-start gap-3 px-4 py-3 text-left text-sm",
                n.unread && "bg-accent/30",
              )}
              onClick={() =>
                startTransition(async () => {
                  if (n.unread) await markNotificationsRead([n.id]);
                  if (n.link) router.push(n.link);
                  else nextRouter.refresh();
                })
              }
            >
              <span
                className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.unread ? "bg-primary" : "bg-transparent")}
                aria-hidden
              />
              <span className="grid min-w-0 gap-0.5">
                <span className={cn("break-words", n.unread && "font-medium")}>
                  {n.unread ? <span className="sr-only">{t("unread")}: </span> : null}
                  {n.text}
                </span>
                <span className="text-muted-foreground text-xs">{n.time}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
