import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

type Variant = "success" | "warning" | "destructive" | "info" | "gold" | "muted" | "outline";

/** One mapping for every status enum in the system (orgs, verification, reservations, documents). */
const STATUS_VARIANTS: Record<string, Variant> = {
  // organisation
  draft: "muted",
  pending_review: "warning",
  active: "success",
  suspended: "destructive",
  closed: "muted",
  // verification
  unverified: "muted",
  pending: "warning",
  verified: "success",
  rejected: "destructive",
  // reservations
  hold: "warning",
  confirmed: "success",
  blocked: "info",
  released: "muted",
  cancelled: "muted",
  // documents
  uploaded: "info",
  under_review: "warning",
  approved: "success",
  expired: "destructive",
  // membership
  invited: "gold",
  removed: "muted",
  // enquiries & quotations
  open: "warning",
  quoted: "info",
  accepted: "success",
  reserved: "success",
  declined: "destructive",
  sent: "info",
  withdrawn: "muted",
  superseded: "muted",
  booked: "success",
  // bookings, payments & refunds
  pending_payment: "warning",
  paid: "success",
  failed: "destructive",
  refund_pending: "warning",
  refund_processing: "info",
  refund_processed: "success",
  refund_failed: "destructive",
  // events, RSVP & outbox
  planning: "info",
  completed: "success",
  attending: "success",
  maybe: "warning",
  queued: "warning",
  skipped: "muted",
  // staff jobs
  awaiting_reply: "warning",
  checked_in: "info",
  // admin
  blocked_user: "destructive",
  hidden: "muted",
  created: "muted",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const t = useTranslations("status");
  const key = status as Parameters<typeof t>[0];
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? "outline"} className={className}>
      {t.has(key) ? t(key) : status}
    </Badge>
  );
}
