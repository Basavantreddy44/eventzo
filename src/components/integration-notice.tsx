import { getTranslations } from "next-intl/server";
import { siRazorpay, siWhatsapp } from "simple-icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type IntegrationProvider = "whatsapp" | "razorpay";
/** comingSoon: not connected yet · simulator: demo stand-in · test / live: connected. */
export type IntegrationState = "comingSoon" | "simulator" | "test" | "live";

const ICONS = { whatsapp: siWhatsapp, razorpay: siRazorpay } as const;

const BADGE: Record<IntegrationState, "gold" | "muted" | "success"> = {
  comingSoon: "gold",
  simulator: "muted",
  test: "muted",
  live: "success",
};

/** The provider's official mark (Simple Icons, CC0) on a white chip so it reads in light and dark themes. */
export function IntegrationMark({ provider, className }: { provider: IntegrationProvider; className?: string }) {
  const icon = ICONS[provider];
  return (
    <span
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border bg-white", className)}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-5" fill={`#${icon.hex}`}>
        <path d={icon.path} />
      </svg>
    </span>
  );
}

/**
 * Says where a third-party integration stands (QA I3/I4): an honest "coming
 * soon" while it isn't connected, instead of a dead button. Server component,
 * so the icon data never ships to the browser.
 */
export async function IntegrationNotice({
  provider,
  state,
  description,
  className,
}: {
  provider: IntegrationProvider;
  state: IntegrationState;
  description: string;
  className?: string;
}) {
  const t = await getTranslations("integrations");
  return (
    <div
      className={cn("bg-card flex items-start gap-3 rounded-lg border p-3", className)}
      data-testid={`integration-${provider}`}
      data-state={state}
    >
      <IntegrationMark provider={provider} />
      <div className="grid min-w-0 gap-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {t(`${provider}.name`)}
          <Badge variant={BADGE[state]}>{t(`states.${state}`)}</Badge>
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
