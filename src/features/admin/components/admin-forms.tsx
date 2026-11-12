"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { changeUserRole, setUserBlock, setVendorStatus } from "../actions";
import type { StaffRole, VendorAction } from "../schemas";

type DynamicT = (key: string) => string;

function ReasonField({
  id,
  value,
  onChange,
  label,
  hint,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={3}
        maxLength={1000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-card focus-visible:border-primary focus-visible:ring-ring rounded-md border px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
      />
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}

/** Suspend / close / reinstate a vendor. A reason is required to suspend or close. */
export function VendorStatusActions({
  organizationId,
  name,
  status,
}: {
  organizationId: string;
  name: string;
  status: string;
}) {
  const t = useTranslations("admin.vendors");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [reason, setReason] = useState("");

  const run = async (action: VendorAction) => {
    const result = await setVendorStatus({ organizationId, action, reason: reason.trim() });
    if (!result.ok) {
      toast.error(tRoot(result.fieldErrors?.reason ?? result.error));
      return;
    }
    toast.success(t(`done.${action}`));
    setReason("");
    router.refresh();
  };

  const closed = status === "suspended" || status === "closed";
  const actions: VendorAction[] = closed
    ? status === "suspended"
      ? ["reinstate", "close"]
      : ["reinstate"]
    : ["suspend", "close"];

  return (
    <div className="grid gap-3" data-testid="vendor-status-actions">
      {!closed || status === "suspended" ? (
        <ReasonField
          id="vendor-reason"
          value={reason}
          onChange={setReason}
          label={t("reason")}
          hint={t("reasonHint")}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <ConfirmDialog
            key={a}
            destructive={a !== "reinstate"}
            title={t(`confirm.${a}.title`, { name })}
            description={t(`confirm.${a}.body`)}
            confirmLabel={t(`actions.${a}`)}
            cancelLabel={tCommon("cancel")}
            trigger={
              <Button
                variant={a === "reinstate" ? "default" : a === "close" ? "outline" : "destructive"}
                disabled={a !== "reinstate" && reason.trim().length < 5}
                data-testid={`vendor-${a}`}
              >
                {t(`actions.${a}`)}
              </Button>
            }
            onConfirm={() => run(a)}
          />
        ))}
      </div>
      {!closed ? <p className="text-muted-foreground text-xs">{t("reasonNeeded")}</p> : null}
    </div>
  );
}

/** Block or unblock a person's sign-in. */
export function UserBlockActions({ userId, name, blocked }: { userId: string; name: string; blocked: boolean }) {
  const t = useTranslations("admin.users");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [reason, setReason] = useState("");

  const run = async () => {
    const result = await setUserBlock({ userId, block: !blocked, reason: reason.trim() });
    if (!result.ok) {
      toast.error(tRoot(result.fieldErrors?.reason ?? result.error));
      return;
    }
    toast.success(blocked ? t("unblocked") : t("blockedDone"));
    setReason("");
    router.refresh();
  };

  return (
    <div className="grid gap-3" data-testid="user-block">
      {!blocked ? (
        <ReasonField id="block-reason" value={reason} onChange={setReason} label={t("reason")} hint={t("reasonHint")} />
      ) : null}
      <ConfirmDialog
        destructive={!blocked}
        title={blocked ? t("unblockTitle", { name }) : t("blockTitle", { name })}
        description={blocked ? t("unblockBody") : t("blockBody")}
        confirmLabel={blocked ? t("unblock") : t("block")}
        cancelLabel={tCommon("cancel")}
        trigger={
          <Button
            variant={blocked ? "default" : "destructive"}
            disabled={!blocked && reason.trim().length < 5}
            className="justify-self-start"
            data-testid={blocked ? "user-unblock" : "user-block-button"}
          >
            {blocked ? t("unblock") : t("block")}
          </Button>
        }
        onConfirm={run}
      />
    </div>
  );
}

/** Grant / revoke platform staff roles (super admins only). */
export function RoleToggles({
  userId,
  roles,
  roleCodes,
}: {
  userId: string;
  roles: string[];
  roleCodes: readonly StaffRole[];
}) {
  const t = useTranslations("admin.users");
  const tRoles = useTranslations("roles");
  const tRoot = useTranslations() as unknown as DynamicT;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <ul className="grid gap-2" data-testid="role-toggles">
      {roleCodes.map((role) => {
        const has = roles.includes(role);
        return (
          <li key={role} className="flex items-center justify-between gap-3 text-sm">
            <span>{tRoles(role)}</span>
            <Button
              size="sm"
              variant={has ? "outline" : "secondary"}
              disabled={pending}
              data-testid={`role-${role}`}
              onClick={() => {
                setBusy(role);
                startTransition(async () => {
                  const result = await changeUserRole({ userId, role, grant: !has });
                  setBusy(null);
                  if (!result.ok) return void toast.error(tRoot(result.error));
                  toast.success(has ? t("roleRevoked") : t("roleGranted"));
                  router.refresh();
                });
              }}
            >
              {pending && busy === role ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {has ? t("revoke") : t("grant")}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
