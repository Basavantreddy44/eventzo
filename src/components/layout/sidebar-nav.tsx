"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { navIcons, type NavItem } from "./nav-icons";

export function SidebarNav({
  items,
  label,
  soonLabel,
  onNavigate,
}: {
  items: NavItem[];
  label: string;
  soonLabel: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="grid gap-0.5">
      {items.map((item) => {
        const Icon = navIcons[item.icon];
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");

        if (item.disabledReason) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title={item.disabledReason}
              className="text-muted-foreground/70 flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm"
            >
              <Icon className="size-4" aria-hidden />
              <span className="flex-1">{item.label}</span>
              <span className="bg-muted rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                {soonLabel}
              </span>
              <span className="sr-only">{item.disabledReason}</span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px]",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
