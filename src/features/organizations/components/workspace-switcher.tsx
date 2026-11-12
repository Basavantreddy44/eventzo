"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2, ChevronsUpDown, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setActiveBranch, setActiveOrganization } from "../actions";

type Option = { id: string; label: string };

function Switcher({
  kind,
  label,
  value,
  options,
  onSelect,
}: {
  kind: "organization" | "branch";
  label: string;
  value: string;
  options: Option[];
  onSelect: (id: string) => Promise<{ ok: boolean }>;
}) {
  const t = useTranslations("vendor.switcher");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = options.find((o) => o.id === value)?.label ?? options[0]?.label ?? "";
  const Icon = kind === "organization" ? Building2 : MapPin;
  const single = options.length <= 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={single || pending}>
        <Button
          variant="outline"
          className="h-auto w-full justify-between gap-2 px-3 py-2 text-left disabled:opacity-100"
          aria-label={label}
          data-testid={`${kind}-switcher`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="text-gold size-4 shrink-0" aria-hidden />
            <span className="grid min-w-0">
              <span className="text-muted-foreground text-[11px] font-normal uppercase">{label}</span>
              <span className="truncate text-sm">{current}</span>
            </span>
          </span>
          {single ? null : <ChevronsUpDown className="text-muted-foreground size-4" aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(id) =>
            startTransition(async () => {
              const result = await onSelect(id);
              if (!result.ok) toast.error(t("switchFailed"));
              router.refresh();
            })
          }
        >
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.id} value={o.id}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkspaceSwitcher({
  organizations,
  activeOrganizationId,
  branches,
  activeBranchId,
  canSelectAllBranches,
}: {
  organizations: Option[];
  activeOrganizationId: string;
  branches: Option[];
  activeBranchId: string | null;
  canSelectAllBranches: boolean;
}) {
  const t = useTranslations("vendor.switcher");
  const branchOptions = canSelectAllBranches ? [{ id: "all", label: t("allBranches") }, ...branches] : branches;

  return (
    <>
      <Switcher
        kind="organization"
        label={t("organization")}
        value={activeOrganizationId}
        options={organizations}
        onSelect={setActiveOrganization}
      />
      {branchOptions.length > 0 ? (
        <Switcher
          kind="branch"
          label={t("branch")}
          value={activeBranchId ?? "all"}
          options={branchOptions}
          onSelect={setActiveBranch}
        />
      ) : null}
    </>
  );
}
