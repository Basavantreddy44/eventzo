import { getTranslations } from "next-intl/server";
import { BellRing, CalendarHeart, Check, Circle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { paymentSteps } from "../lib/timeline";

/**
 * C8: one place to see what is paid and what is due next — booked, advance,
 * balance (due date + automatic reminders) and the event day.
 */
export async function PaymentTimeline({
  item,
  locale,
  today,
}: {
  item: {
    status: string;
    currency: string;
    total_paise: number;
    advance_paise: number;
    paid_paise: number;
    payment_due_at: string;
    balance_due_on: string;
    event_date: string;
    created_at: string;
  };
  locale: string;
  today: string;
}) {
  const t = await getTranslations("bookings.timeline");
  const money = (p: number) => formatPaise(p, { currency: item.currency });
  const day = (d: string) => formatDateTime(`${d}T12:00:00Z`, locale, undefined, { dateStyle: "medium" });
  const steps = paymentSteps(item, today);

  return (
    <Card data-testid="payment-timeline">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-4">
          {steps.map((s) => {
            const Icon =
              s.state === "done" ? Check : s.state === "due" ? Clock : s.key === "event" ? CalendarHeart : Circle;
            return (
              <li
                key={s.key}
                className="grid grid-cols-[auto_1fr] gap-3"
                data-testid={`timeline-${s.key}`}
                data-state={s.state}
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border",
                    s.state === "done" && "bg-success text-success-foreground border-success",
                    s.state === "due" && "border-gold bg-gold/15 text-primary-strong",
                    s.state === "overdue" && "border-destructive bg-destructive/10 text-destructive",
                    s.state === "upcoming" && "text-muted-foreground",
                  )}
                  aria-hidden
                >
                  <Icon className="size-4" />
                </span>
                <div className="grid gap-0.5 text-sm">
                  <span className="font-medium">
                    {t(`steps.${s.key}`)}
                    {s.amount != null ? <span className="ml-2 font-semibold">{money(s.amount)}</span> : null}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {s.key === "booked"
                      ? day(item.created_at.slice(0, 10))
                      : s.key === "advance"
                        ? s.state === "done"
                          ? t("paid")
                          : t("advanceDue", { time: formatDateTime(item.payment_due_at, locale) })
                        : s.key === "balance"
                          ? s.state === "done"
                            ? t("paid")
                            : s.state === "overdue"
                              ? t("balanceOverdue", { date: day(item.balance_due_on) })
                              : t("balanceDue", { date: day(item.balance_due_on) })
                          : day(item.event_date)}
                  </span>
                  {s.key === "balance" && s.state !== "done" && item.status === "confirmed" ? (
                    <span className="text-muted-foreground flex items-center gap-1 text-xs">
                      <BellRing className="size-3" aria-hidden />
                      {t("reminders")}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
