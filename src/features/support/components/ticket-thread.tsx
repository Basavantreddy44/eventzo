import { getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

type Message = { id: string; side: string; internal: boolean; body: string; created_at: string };

/** The conversation between the customer and the Eventzo team. */
export async function TicketThread({
  messages,
  locale,
  viewer,
}: {
  messages: Message[];
  locale: string;
  viewer: "customer" | "agent";
}) {
  const t = await getTranslations("support");
  return (
    <ol className="grid gap-3" data-testid="ticket-thread">
      {messages.map((m) => {
        const mine = m.side === viewer;
        return (
          <li
            key={m.id}
            className={cn(
              "grid max-w-[85%] gap-1 rounded-lg p-3 text-sm",
              mine ? "bg-primary/10 justify-self-end" : "bg-muted justify-self-start",
              m.internal && "border-gold/60 bg-gold/10 border border-dashed",
            )}
          >
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              {m.internal ? <Lock className="size-3" aria-hidden /> : null}
              {m.internal ? t("internalNote") : m.side === "agent" ? t("fromTeam") : t("fromCustomer")} ·{" "}
              {formatDateTime(m.created_at, locale)}
            </span>
            <p className="whitespace-pre-line">{m.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
