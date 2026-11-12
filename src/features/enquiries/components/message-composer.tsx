"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postEnquiryMessage } from "../actions/customer";

export function MessageComposer({ enquiryId }: { enquiryId: string }) {
  const t = useTranslations("enquiries");
  const tRoot = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex items-end gap-2"
      aria-label={t("conversation")}
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        startTransition(async () => {
          const result = await postEnquiryMessage(enquiryId, body);
          if (!result.ok) {
            toast.error(tRoot(result.error));
            return;
          }
          setBody("");
          router.refresh();
        });
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder={t("messagePlaceholder")}
        aria-label={t("messagePlaceholder")}
        className="border-input bg-card focus-visible:border-primary focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
      />
      <Button type="submit" disabled={pending || !body.trim()}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {t("send")}
      </Button>
    </form>
  );
}
