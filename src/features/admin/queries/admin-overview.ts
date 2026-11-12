import "server-only";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import type { AuditLogRow, OrganizationStatus } from "@/types/database";

const ORG_STATUSES: OrganizationStatus[] = ["draft", "pending_review", "active", "suspended", "closed"];

export type AdminOverview = {
  /** null = the caller's role doesn't include this view */
  organizationsByStatus: { status: OrganizationStatus; count: number }[] | null;
  organizationsTotal: number | null;
  verificationQueue: number | null;
  usersTotal: number | null;
  recentAudit:
    Pick<AuditLogRow, "id" | "occurred_at" | "action" | "entity_table" | "entity_id" | "actor_user_id">[] | null;
};

function countOrThrow(res: { count: number | null; error: { message: string } | null }, what: string) {
  if (res.error) throw new Error(`Failed to count ${what}: ${res.error.message}`);
  return res.count ?? 0;
}

/**
 * Each card is gated by the matching platform permission here, and the same
 * rule is enforced again by RLS underneath.
 */
export async function getAdminOverview(user: CurrentUser): Promise<AdminOverview> {
  const supabase = await createClient();
  const canOrgs = hasPermission(user.access, "organizations.read");
  const canVerify = hasPermission(user.access, "verification.manage");
  const canUsers = hasPermission(user.access, "users.read");
  const canAudit = hasPermission(user.access, "audit.read");

  const [orgCounts, queue, users, audit] = await Promise.all([
    canOrgs
      ? Promise.all(
          ORG_STATUSES.map(async (status) => ({
            status,
            count: countOrThrow(
              await supabase.from("organizations").select("id", { count: "exact", head: true }).eq("status", status),
              "organisations",
            ),
          })),
        )
      : null,
    canVerify
      ? supabase
          .from("business_documents")
          .select("id", { count: "exact", head: true })
          .in("status", ["uploaded", "under_review"])
          .then((r) => countOrThrow(r, "documents"))
      : null,
    canUsers
      ? supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .then((r) => countOrThrow(r, "users"))
      : null,
    canAudit
      ? supabase
          .from("audit_logs")
          .select("id, occurred_at, action, entity_table, entity_id, actor_user_id")
          .order("occurred_at", { ascending: false })
          .limit(10)
          .then((r) => {
            if (r.error) throw new Error(`Failed to load audit log: ${r.error.message}`);
            return r.data ?? [];
          })
      : null,
  ]);

  return {
    organizationsByStatus: orgCounts,
    organizationsTotal: orgCounts ? orgCounts.reduce((sum, s) => sum + s.count, 0) : null,
    verificationQueue: queue,
    usersTotal: users,
    recentAudit: audit,
  };
}
