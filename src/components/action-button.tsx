"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ActionResult } from "@/lib/errors";

type DynamicT = (key: string) => string;

/**
 * Runs a bound Server Action (e.g. `setActive.bind(null, id, false)`), shows a
 * toast and refreshes. Pass `confirm` to ask first (destructive actions).
 */
export function ActionButton({
  action,
  label,
  successMessage,
  variant = "ghost",
  size = "sm",
  confirm,
  testId,
}: {
  action: () => Promise<ActionResult<unknown>>;
  label: string;
  successMessage: string;
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  size?: "sm" | "default";
  confirm?: { title: string; description: string; destructive?: boolean };
  testId?: string;
}) {
  const t = useTranslations() as unknown as DynamicT;
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = async () => {
    const result = await action();
    if (result.ok) {
      toast.success(successMessage);
      router.refresh();
    } else {
      toast.error(t(result.error));
    }
  };

  if (confirm) {
    return (
      <ConfirmDialog
        destructive={confirm.destructive}
        title={confirm.title}
        description={confirm.description}
        confirmLabel={label}
        cancelLabel={tCommon("cancel")}
        trigger={
          <Button variant={variant} size={size} data-testid={testId}>
            {label}
          </Button>
        }
        onConfirm={run}
      />
    );
  }

  return (
    <Button variant={variant} size={size} disabled={pending} data-testid={testId} onClick={() => startTransition(run)}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {label}
    </Button>
  );
}
