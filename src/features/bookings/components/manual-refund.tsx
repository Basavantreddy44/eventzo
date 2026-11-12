"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeManualRefund } from "../actions/vendor";

/** Marks a refund of offline money as returned, with a reference (e.g. UPI transaction id). */
export function ManualRefund({ refundId }: { refundId: string }) {
  const t = useTranslations("refunds");
  const tRoot = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      aria-label={t("markRefunded")}
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await completeManualRefund({ refundId, reference });
          if (result.ok) {
            toast.success(t("recorded"));
            router.refresh();
          } else toast.error(tRoot(result.error));
        });
      }}
    >
      <Input
        aria-label={t("reference")}
        placeholder={t("reference")}
        value={reference}
        maxLength={200}
        onChange={(e) => setReference(e.target.value)}
        className="h-8 w-44"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending || !reference.trim()}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("markRefunded")}
      </Button>
    </form>
  );
}
