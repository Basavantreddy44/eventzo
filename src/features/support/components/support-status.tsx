import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { SupportStatus } from "../schemas";

const VARIANTS: Record<SupportStatus, "warning" | "info" | "gold" | "success" | "muted"> = {
  open: "warning",
  in_progress: "info",
  waiting_customer: "gold",
  resolved: "success",
  closed: "muted",
};

export function SupportStatusBadge({ status }: { status: string }) {
  const t = useTranslations("support.statuses");
  const s = (status in VARIANTS ? status : "open") as SupportStatus;
  return <Badge variant={VARIANTS[s]}>{t(s)}</Badge>;
}
