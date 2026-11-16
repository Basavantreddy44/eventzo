"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { replyToReview } from "../actions";

type DynamicT = (key: string) => string;

/** The vendor's public reply under a review (editable). */
export function ReplyForm({ reviewId, initial }: { reviewId: string; initial?: string | null }) {
  const t = useTranslations("reviews");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const id = `review-reply-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [reply, setReply] = useState(initial ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await replyToReview({ reviewId, reply });
          if (!result.ok) {
            toast.error(tRoot(result.error));
            return;
          }
          toast.success(t("replySaved"));
          router.refresh();
        });
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        {t("replyLabel")}
      </label>
      <textarea
        id={id}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder={t("replyPlaceholder")}
        className="border-input bg-card focus-visible:border-primary focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
      />
      <p className="text-muted-foreground text-xs">{t("replyHint")}</p>
      <Button type="submit" size="sm" className="sm:justify-self-start" disabled={pending || !reply.trim()}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {initial ? t("updateReply") : t("sendReply")}
      </Button>
    </form>
  );
}
