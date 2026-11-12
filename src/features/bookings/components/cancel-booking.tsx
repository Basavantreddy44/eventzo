"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cancelBooking } from "../actions/customer";
import { vendorCancelBooking } from "../actions/vendor";

/**
 * Cancels one booking item. `refundText` is the server-computed refund
 * ("You'll get ₹25,000 back") shown in the confirmation. Vendors must give a reason.
 */
export function CancelBooking({
  itemId,
  side,
  refundText,
}: {
  itemId: string;
  side: "customer" | "vendor";
  refundText: string;
}) {
  const t = useTranslations("bookings");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [reason, setReason] = useState("");
  const needsReason = side === "vendor";

  return (
    <div className="grid gap-2">
      <Label htmlFor="cancel-reason">
        {t("cancelReason")}
        {needsReason ? null : <span className="text-muted-foreground font-normal"> ({tCommon("optional")})</span>}
      </Label>
      <Input id="cancel-reason" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
      <ConfirmDialog
        destructive
        title={t("cancelTitle")}
        description={refundText}
        confirmLabel={t("cancel")}
        cancelLabel={tCommon("back")}
        trigger={
          <Button
            variant="outline"
            className="text-destructive sm:justify-self-start"
            disabled={needsReason && !reason.trim()}
            title={needsReason && !reason.trim() ? t("reasonNeeded") : undefined}
          >
            {t("cancel")}
          </Button>
        }
        onConfirm={async () => {
          const input = { itemId, reason };
          const result = side === "vendor" ? await vendorCancelBooking(input) : await cancelBooking(input);
          if (result.ok) {
            toast.success(t("cancelled"));
            router.refresh();
          } else toast.error(tRoot(result.error));
        }}
      />
      {needsReason && !reason.trim() ? <p className="text-muted-foreground text-xs">{t("reasonNeeded")}</p> : null}
    </div>
  );
}
