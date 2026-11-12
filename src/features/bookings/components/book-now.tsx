"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createBooking } from "../actions/customer";

/** Accepted quote / instant reservation → booking. One idempotency key per page view. */
export function BookNow({ enquiryId, confirmBody }: { enquiryId: string; confirmBody: string }) {
  const t = useTranslations("bookings");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());

  return (
    <ConfirmDialog
      title={t("bookTitle")}
      description={confirmBody}
      confirmLabel={t("book")}
      cancelLabel={tCommon("cancel")}
      trigger={
        <Button className="w-full sm:w-auto" data-testid="book-now">
          {t("book")}
        </Button>
      }
      onConfirm={async () => {
        const result = await createBooking(enquiryId, key);
        if (!result.ok) {
          toast.error(tRoot(result.error));
          return;
        }
        toast.success(t("booked"));
        router.push(`/account/bookings/${result.data}`);
      }}
    />
  );
}
