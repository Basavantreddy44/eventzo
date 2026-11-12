import { Link } from "@/i18n/navigation";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export function BrandLogo({ href = "/", suffix, className }: { href?: string; suffix?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group focus-visible:ring-ring inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-[3px]",
        className,
      )}
    >
      <span
        aria-hidden
        className="bg-primary font-display text-primary-foreground relative flex size-8 items-center justify-center rounded-lg text-lg leading-none font-semibold shadow-sm"
      >
        E
        <span className="border-background bg-gold absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2" />
      </span>
      <span className="font-display text-primary-strong text-xl font-semibold tracking-tight">{siteConfig.name}</span>
      {suffix ? (
        <span className="bg-accent text-accent-foreground rounded-md px-1.5 py-0.5 text-[11px] font-medium tracking-wide uppercase">
          {suffix}
        </span>
      ) : null}
    </Link>
  );
}
