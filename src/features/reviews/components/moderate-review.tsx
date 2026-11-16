"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { moderateReview } from "../actions";

type DynamicT = (key: string) => string;

/** Admin: hide a review (with a reason the vendor and customer can be told) or restore it. */
export function ModerateReview({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  const t = useTranslations("reviews");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const id = `hide-reason-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (status: "published" | "hidden") =>
    startTransition(async () => {
      const result = await moderateReview({ reviewId, status, reason: reason || undefined });
      if (!result.ok) {
        toast.error(tRoot(result.error));
        return;
      }
      toast.success(status === "hidden" ? t("hiddenToast") : t("restoredToast"));
      setReason("");
      router.refresh();
    });

  if (hidden) {
    return (
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run("published")}>
        {t("restore")}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <label htmlFor={id} className="text-xs font-medium">
          {t("hideReason")}
        </label>
        <Input
          id={id}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          className="h-8 w-56"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive"
        disabled={pending || !reason.trim()}
        title={!reason.trim() ? t("reasonRequired") : undefined}
        onClick={() => run("hidden")}
      >
        {t("hide")}
      </Button>
    </div>
  );
}
