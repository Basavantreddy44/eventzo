"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { updateSupportTicket } from "../actions";
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES, type SupportStatus } from "../schemas";

type DynamicT = (key: string) => string;

/** Agent controls: status, priority, owner. Every change lands in the audit log. */
export function TicketControls({
  ticketId,
  status,
  priority,
  assignedTo,
  agents,
}: {
  ticketId: string;
  status: SupportStatus;
  priority: "normal" | "high";
  assignedTo: string | null;
  agents: { id: string; full_name: string }[];
}) {
  const t = useTranslations("support");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [s, setS] = useState(status);
  const [p, setP] = useState(priority);
  const [a, setA] = useState(assignedTo ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = s !== status || p !== priority || (a || null) !== assignedTo;

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updateSupportTicket({ ticketId, status: s, priority: p, assignedTo: a || null });
          if (!result.ok) {
            toast.error(tRoot(result.error));
            return;
          }
          toast.success(t("updated"));
          router.refresh();
        });
      }}
    >
      <div className="grid gap-1">
        <label htmlFor={`tk-status-${uid}`} className="text-sm font-medium">
          {t("status")}
        </label>
        <NativeSelect
          id={`tk-status-${uid}`}
          value={s}
          onChange={(e) => setS(e.target.value as SupportStatus)}
          data-testid="ticket-status"
        >
          {SUPPORT_STATUSES.map((v) => (
            <option key={v} value={v}>
              {t(`statuses.${v}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1">
        <label htmlFor={`tk-priority-${uid}`} className="text-sm font-medium">
          {t("priority")}
        </label>
        <NativeSelect id={`tk-priority-${uid}`} value={p} onChange={(e) => setP(e.target.value as "normal" | "high")}>
          {SUPPORT_PRIORITIES.map((v) => (
            <option key={v} value={v}>
              {t(`priorities.${v}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1">
        <label htmlFor={`tk-owner-${uid}`} className="text-sm font-medium">
          {t("owner")}
        </label>
        <NativeSelect id={`tk-owner-${uid}`} value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">{t("unassigned")}</option>
          {agents.map((ag) => (
            <option key={ag.id} value={ag.id}>
              {ag.full_name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" disabled={pending || !dirty} data-testid="ticket-save">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("save")}
      </Button>
    </form>
  );
}
