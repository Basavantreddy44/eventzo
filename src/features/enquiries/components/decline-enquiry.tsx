"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { declineEnquiry } from "../actions/vendor";

export function DeclineEnquiry({ enquiryId }: { enquiryId: string }) {
  const t = useTranslations("vendorEnquiries");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [reason, setReason] = useState("");

  return (
    <div className="grid gap-2">
      <Label htmlFor="decline-reason">{t("declineReason")}</Label>
      <Input id="decline-reason" value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
      <ConfirmDialog
        destructive
        title={t("declineTitle")}
        description={t("declineBody")}
        confirmLabel={t("decline")}
        cancelLabel={tCommon("cancel")}
        trigger={
          <Button variant="outline" className="text-destructive sm:justify-self-start">
            {t("decline")}
          </Button>
        }
        onConfirm={async () => {
          const result = await declineEnquiry(enquiryId, reason);
          if (result.ok) {
            toast.success(t("declined"));
            router.refresh();
          } else toast.error(tRoot(result.error));
        }}
      />
    </div>
  );
}
