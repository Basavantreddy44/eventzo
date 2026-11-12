import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseTstzRange } from "@/lib/datetime";
import type { OrganizationRow, ReservationSource, ReservationStatus } from "@/types/database";
import type { VendorContext } from "./vendor-context";

export type UpcomingReservation = {
  id: string;
  resourceName: string;
  start: string;
  end: string;
  status: ReservationStatus;
  source: ReservationSource;
  quantity: number;
};

export type VendorDashboard = {
  organization: Pick<OrganizationRow, "id" | "name" | "status" | "verification_status">;
  branchCount: number;
  resourceCount: number;
  upcomingCount: number;
  upcoming: UpcomingReservation[];
  checklist: { profileComplete: boolean; documentsUploaded: boolean; resourcesAdded: boolean };
};

const ACTIVE_STATUSES: ReservationStatus[] = ["hold", "confirmed", "blocked"];

/** Real numbers only — every query runs under the user's RLS. */
export async function getVendorDashboard(ctx: VendorContext): Promise<VendorDashboard> {
  const supabase = await createClient();
  const orgId = ctx.membership.organization_id;

  const [orgRes, resourcesRes, profileRes, docsRes] = await Promise.all([
    supabase.from("organizations").select("id, name, status, verification_status").eq("id", orgId).single(),
    (() => {
      let q = supabase.from("bookable_resources").select("id, name").eq("organization_id", orgId).eq("active", true);
      if (ctx.activeBranchId) q = q.eq("branch_id", ctx.activeBranchId);
      return q;
    })(),
    supabase.from("business_profiles").select("description, contact_phone").eq("organization_id", orgId).maybeSingle(),
    // Owners only (RLS); other roles get 0 rows, which is the correct view for them.
    supabase.from("business_documents").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
  ]);

  if (orgRes.error) throw new Error(`Failed to load organisation: ${orgRes.error.message}`);
  if (resourcesRes.error) throw new Error(`Failed to load resources: ${resourcesRes.error.message}`);

  const resources = resourcesRes.data ?? [];
  const resourceNames = new Map(resources.map((r) => [r.id, r.name]));

  let upcoming: UpcomingReservation[] = [];
  let upcomingCount = 0;
  if (resources.length > 0) {
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const window = `[${now.toISOString()},${horizon.toISOString()})`;

    const { data, count, error } = await supabase
      .from("resource_reservations")
      .select("id, resource_id, period, status, source, quantity", { count: "exact" })
      .eq("organization_id", orgId)
      .in("resource_id", [...resourceNames.keys()])
      .in("status", ACTIVE_STATUSES)
      .overlaps("period", window)
      .order("period")
      .limit(10);
    if (error) throw new Error(`Failed to load reservations: ${error.message}`);

    upcomingCount = count ?? 0;
    upcoming = (data ?? []).flatMap((r) => {
      const range = parseTstzRange(String(r.period)); // tstzrange arrives as a string literal
      if (!range) return [];
      return [
        {
          id: r.id,
          resourceName: resourceNames.get(r.resource_id) ?? "—",
          start: range.start.toISOString(),
          end: range.end.toISOString(),
          status: r.status,
          source: r.source,
          quantity: r.quantity,
        },
      ];
    });
  }

  return {
    organization: orgRes.data,
    branchCount: ctx.branches.length,
    resourceCount: resources.length,
    upcomingCount,
    upcoming,
    checklist: {
      profileComplete: !!(profileRes.data?.description && profileRes.data?.contact_phone),
      documentsUploaded: (docsRes.count ?? 0) > 0,
      resourcesAdded: resources.length > 0,
    },
  };
}
