"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { respondToInvitation } from "../actions/team";

/** Accept / decline buttons on the account page. Accepting opens the vendor dashboard. */
export function InvitationResponse({ invitationId, vendorHref }: { invitationId: string; vendorHref: string }) {
  const t = useTranslations("account");
  const tRoot = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const respond = (accept: boolean) =>
    startTransition(async () => {
      const result = await respondToInvitation(invitationId, accept);
      if (!result.ok) {
        toast.error(tRoot(result.error));
        return;
      }
      toast.success(accept ? t("accepted") : t("declined"));
      if (accept) router.push(vendorHref);
      else router.refresh();
    });

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => respond(true)}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("accept")}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => respond(false)}>
        {t("decline")}
      </Button>
    </div>
  );
}
