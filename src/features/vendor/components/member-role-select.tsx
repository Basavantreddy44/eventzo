"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/input";
import { changeMemberRole } from "../actions/team";

type Role = "owner" | "branch_manager" | "staff";

/** Owner-only inline role change. The DB refuses to demote the last owner. */
export function MemberRoleSelect({ memberId, role, label }: { memberId: string; role: Role; label: string }) {
  const t = useTranslations();
  const tRoot = t as unknown as (key: string) => string;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <NativeSelect
      aria-label={label}
      defaultValue={role}
      disabled={pending}
      className="h-8 w-auto py-0 text-sm"
      onChange={(e) => {
        const next = e.target.value as Role;
        startTransition(async () => {
          const result = await changeMemberRole(memberId, next);
          if (result.ok) toast.success(t("vendor.team.roleChanged"));
          else {
            toast.error(tRoot(result.error));
            e.target.value = role;
          }
          router.refresh();
        });
      }}
    >
      {(["owner", "branch_manager", "staff"] as const).map((r) => (
        <option key={r} value={r}>
          {t(`roles.${r}`)}
        </option>
      ))}
    </NativeSelect>
  );
}
