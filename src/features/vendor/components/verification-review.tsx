"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decideVerification, reviewDocument } from "../actions/verification";

type DynamicT = (key: string) => string;

/** Approve / reject one document (reject requires a reason shown to the vendor). */
export function DocumentReview({ documentId }: { documentId: string }) {
  const t = useTranslations("admin.verification");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const decide = (approve: boolean) =>
    startTransition(async () => {
      const result = await reviewDocument(documentId, approve, reason);
      if (!result.ok) {
        toast.error(tRoot(result.error));
        return;
      }
      toast.success(approve ? t("documentApproved") : t("documentRejected"));
      setReason("");
      router.refresh();
    });

  return (
    <div className="grid gap-2">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("reason")}
        aria-label={t("reason")}
        maxLength={500}
        className="h-8 text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => decide(true)}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          {t("approve")}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(false)}>
          <X aria-hidden />
          {t("reject")}
        </Button>
      </div>
    </div>
  );
}

/** Final vendor decision: verified (needs ≥ 1 approved document) or rejected (needs a reason). */
export function VerificationDecision({ organizationId, queueHref }: { organizationId: string; queueHref: string }) {
  const t = useTranslations("admin.verification");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const decide = (status: "verified" | "rejected") =>
    startTransition(async () => {
      const result = await decideVerification(organizationId, status, reason);
      if (!result.ok) {
        toast.error(tRoot(result.error));
        return;
      }
      toast.success(status === "verified" ? t("vendorVerified") : t("vendorRejected"));
      router.push(queueHref);
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("reason")}
        aria-label={t("reason")}
        maxLength={500}
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => decide("verified")} data-testid="verify-vendor">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          {t("verify")}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => decide("rejected")}>
          <X aria-hidden />
          {t("rejectVendor")}
        </Button>
      </div>
    </div>
  );
}
