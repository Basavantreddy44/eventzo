"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { simulateOnlinePayment } from "@/features/payments/actions/simulator";
import { confirmOnlinePayment, startOnlinePayment } from "../actions/customer";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, cb: () => void) => void };
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Loads Razorpay Checkout once, on demand (only when the customer clicks Pay). */
function loadCheckout(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Razorpay unavailable")));
    script.onerror = () => reject(new Error("Could not load Razorpay"));
    document.body.appendChild(script);
  });
}

/**
 * Pays the advance (or the balance) online.
 * - mode "razorpay": Razorpay Checkout.
 * - mode "simulator": a clearly labelled dummy checkout (no real money), used
 *   until Razorpay keys are added.
 * - mode null: disabled, with the reason shown.
 */
export function PayOnline({
  itemId,
  label,
  amountLabel,
  mode,
  disabledReason,
}: {
  itemId: string;
  label: string;
  amountLabel: string;
  mode: "razorpay" | "simulator" | null;
  disabledReason: string;
}) {
  const t = useTranslations("bookings");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (!mode) {
    return (
      <div className="grid gap-1">
        <Button disabled className="w-full sm:w-auto" data-testid="pay-online">
          {label}
        </Button>
        <p className="text-muted-foreground text-xs" data-testid="pay-disabled-reason">
          {disabledReason}
        </p>
      </div>
    );
  }

  if (mode === "simulator") {
    const simulate = async (succeed: boolean) => {
      setBusy(true);
      const result = await simulateOnlinePayment(itemId, succeed);
      setBusy(false);
      setOpen(false);
      if (result.ok) toast.success(t("paidToast"));
      else toast.error(tRoot(result.error));
      router.refresh();
    };
    return (
      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogTrigger asChild>
          <Button className="w-full sm:w-auto" data-testid="pay-online">
            {label}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FlaskConical className="text-gold size-5" aria-hidden />
              {t("simTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("simBody", { amount: amountLabel })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{tCommon("cancel")}</AlertDialogCancel>
            <Button variant="outline" disabled={busy} onClick={() => simulate(false)}>
              {t("simFail")}
            </Button>
            <Button disabled={busy} onClick={() => simulate(true)} data-testid="sim-pay">
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t("simPay", { amount: amountLabel })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const pay = async () => {
    setBusy(true);
    try {
      const started = await startOnlinePayment(itemId);
      if (!started.ok) {
        toast.error(tRoot(started.error));
        return;
      }
      const o = started.data;
      const Razorpay = await loadCheckout();
      const checkout = new Razorpay({
        key: o.keyId,
        order_id: o.orderId,
        amount: o.amountPaise,
        currency: o.currency,
        name: "Eventzo",
        description: o.description,
        prefill: o.prefill,
        theme: { color: "#7b1e3a" },
        handler: async (r: RazorpayResponse) => {
          const confirmed = await confirmOnlinePayment({
            orderId: r.razorpay_order_id,
            paymentId: r.razorpay_payment_id,
            signature: r.razorpay_signature,
          });
          if (confirmed.ok) toast.success(t("paidToast"));
          else toast.error(tRoot(confirmed.error));
          router.refresh();
        },
        modal: { ondismiss: () => toast.info(t("payCancelled")) },
      });
      checkout.on("payment.failed", () => toast.error(t("payFailed")));
      checkout.open();
    } catch {
      toast.error(t("checkoutLoadError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button onClick={pay} disabled={busy} className="w-full sm:w-auto" data-testid="pay-online">
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {label}
    </Button>
  );
}
