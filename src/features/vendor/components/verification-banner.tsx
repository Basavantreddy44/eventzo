import { getTranslations } from "next-intl/server";
import { AlertTriangle, Hourglass, Wrench } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { resubmitVerification } from "../actions/verification";

/**
 * Roadmap V11: tells the vendor where verification stands — under review
 * (usually 24 h), or what Eventzo asked them to fix, with "Fix" and
 * "Send for review again".
 */
export async function VerificationBanner({
  organizationId,
  status,
  note,
  noteAt,
  isOwner,
  locale,
  showFixLink = true,
}: {
  organizationId: string;
  status: string;
  note: string | null;
  noteAt: string | null;
  isOwner: boolean;
  locale: string;
  showFixLink?: boolean;
}) {
  if (status !== "pending" && status !== "changes_requested" && status !== "rejected") return null;
  const t = await getTranslations("vendor.verificationBanner");
  const changes = status === "changes_requested";
  const Icon = status === "pending" ? Hourglass : changes ? Wrench : AlertTriangle;

  return (
    <div
      role="status"
      data-testid="verification-banner"
      data-state={status}
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-xl border p-4 text-sm",
        status === "pending" ? "border-info/40 bg-info/5" : "border-gold/50 bg-accent/40",
        status === "rejected" && "border-destructive/40 bg-destructive/5",
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="font-semibold">{t(`${status as "pending"}Title`)}</p>
        <p>{t(`${status as "pending"}Body`)}</p>
        {note && status !== "pending" ? (
          <p className="bg-background/70 rounded-md border p-2" data-testid="verification-note">
            <span className="font-medium">{t("reasonLabel")}</span> {note}
            {noteAt ? (
              <span className="text-muted-foreground block text-xs">{formatDateTime(noteAt, locale)}</span>
            ) : null}
          </p>
        ) : null}
      </div>
      {changes && isOwner ? (
        <div className="flex flex-wrap gap-2">
          {showFixLink ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/vendor/documents">{t("fix")}</Link>
            </Button>
          ) : null}
          <ActionButton
            action={resubmitVerification.bind(null, organizationId)}
            label={t("resubmit")}
            successMessage={t("resubmitted")}
            variant="default"
            testId="resubmit-verification"
          />
        </div>
      ) : null}
    </div>
  );
}
