"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/features/auth/actions";

export type UserMenuProps = {
  name: string;
  email: string | null;
  showVendor: boolean;
  showAdmin: boolean;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function UserMenu({ name, email, showVendor, showAdmin }: UserMenuProps) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-10 gap-2 px-1.5 sm:px-2"
          aria-label={t("nav.account")}
          data-testid="user-menu"
        >
          <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-full text-sm font-semibold">
            {initials(name)}
          </span>
          <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="truncate">{name}</span>
          {email ? <span className="text-muted-foreground truncate text-xs font-normal">{email}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/account">
              <UserRound aria-hidden />
              {t("nav.account")}
            </Link>
          </DropdownMenuItem>
          {showVendor ? (
            <DropdownMenuItem asChild>
              <Link href="/vendor">
                <Briefcase aria-hidden />
                {t("nav.vendor")}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link href="/become-a-vendor">
                <Briefcase aria-hidden />
                {t("nav.becomeVendor")}
              </Link>
            </DropdownMenuItem>
          )}
          {showAdmin ? (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <ShieldCheck aria-hidden />
                {t("nav.admin")}
              </Link>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            startTransition(async () => {
              // Drop the staff app's offline copy of the job list (private data) before leaving.
              try {
                await globalThis.caches?.delete("eventzo-jobs-pages-v1");
              } catch {
                // caches unavailable (insecure context / private mode): nothing stored to clear.
              }
              await signOut();
            });
          }}
        >
          <LogOut aria-hidden />
          {pending ? t("common.signingOut") : t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
