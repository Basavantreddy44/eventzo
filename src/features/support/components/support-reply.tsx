"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postSupportMessage } from "../actions";

type DynamicT = (key: string) => string;

/** Reply box for a support request. Agents can also leave internal notes. */
export function SupportReply({ ticketId, agent = false }: { ticketId: string; agent?: boolean }) {
  const t = useTranslations("support");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-2"
      data-testid="support-reply"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await postSupportMessage({ ticketId, body, internal: agent && internal });
          if (!result.ok) {
            toast.error(tRoot(result.error));
            return;
          }
          setBody("");
          toast.success(agent && internal ? t("noteSaved") : t("replySent"));
          router.refresh();
        });
      }}
    >
      <label htmlFor={`support-body-${uid}`} className="sr-only">
        {t("message")}
      </label>
      <textarea
        id={`support-body-${uid}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder={agent ? t("agentPlaceholder") : t("customerPlaceholder")}
        className="border-input bg-card focus-visible:border-primary focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !body.trim()}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {agent && internal ? t("saveNote") : t("send")}
        </Button>
        {agent ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
              className="accent-primary"
              data-testid="support-internal"
            />
            {t("internalNote")}
          </label>
        ) : null}
      </div>
    </form>
  );
}
