"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ActionResult } from "@/lib/errors";

type DynamicT = (key: string) => string;

/** Confirms, then runs a bound Server Action (e.g. `deleteX.bind(null, id)`). */
export function DeleteRowButton({
  action,
  label,
  title,
  description,
  successMessage,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  title: string;
  description: string;
  successMessage: string;
}) {
  const t = useTranslations() as unknown as DynamicT;
  const tCommon = useTranslations("common");
  const router = useRouter();

  return (
    <ConfirmDialog
      destructive
      title={title}
      description={description}
      confirmLabel={label}
      cancelLabel={tCommon("cancel")}
      trigger={
        <Button variant="ghost" size="sm" className="text-destructive">
          <Trash2 aria-hidden />
          {label}
        </Button>
      }
      onConfirm={async () => {
        const result = await action();
        if (result.ok) {
          toast.success(successMessage);
          router.refresh();
        } else {
          toast.error(t(result.error));
        }
      }}
    />
  );
}
