import "server-only";

import { createClient } from "@/lib/supabase/server";
import { zonedToIso } from "@/features/enquiries/schemas";
import { bookingSnapshotOf } from "@/features/bookings/queries";
import type { OrganizationStatus } from "@/types/database";
import { PAGE_SIZE, type AuditFilters, type LedgerFilters } from "../schemas";

/**
 * Platform admin reads. Every query runs with the admin's own session: RLS and
 * the admin_* functions check the matching platform permission.
 */

const dayStart = (d: string) => zonedToIso(d, "00:00");
const dayEnd = (d: string) => new Date(new Date(zonedToIso(d, "00:00")).getTime() + 86_400_000).toISOString();

// ---------- vendors -----------------------------------------------------------------------
export async function listVendors(search: string, status: OrganizationStatus | null, page: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_vendors", {
    p_search: search || (null as unknown as string),
    p_status: status ?? (null as unknown as OrganizationStatus),
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error(`Failed to load vendors: ${error.message}`);
  return { rows: data ?? [], total: Number(data?.[0]?.total_count ?? 0) };
}

export type VendorOverview = {
  listings: { published: number; paused: number; draft: number };
  enquiries_90d: number;
  bookings: {
    confirmed_upcoming: number;
    confirmed_total: number;
    cancelled_by_vendor: number;
    cancelled_total: number;
  };
  money: { received_paise: number; online_paise: number; offline_paise: number } | null;
  refunds_pending: number | null;
  members: number;
};

export async function getVendorAdmin(organizationId: string) {
  const supabase = await createClient();
  const [org, profile, branches, listings, members, overview] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, name, slug, legal_name, status, verification_status, verified_at, status_reason, status_changed_at, created_at, cities(name), business_categories(name)",
      )
      .eq("id", organizationId)
      .maybeSingle(),
    supabase
      .from("business_profiles")
      .select("display_name, tagline, contact_email, contact_phone, whatsapp_phone, website, gstin, pan")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("id, name, address_line1, pincode, phone, is_primary, active")
      .eq("organization_id", organizationId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("services")
      .select("id, slug, title, status, updated_at")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase.rpc("org_member_directory", { p_organization_id: organizationId }),
    supabase.rpc("admin_vendor_overview", { p_organization_id: organizationId }),
  ]);
  if (org.error) throw new Error(`Failed to load vendor: ${org.error.message}`);
  if (!org.data) return null;
  return {
    organization: org.data,
    profile: profile.data,
    branches: branches.data ?? [],
    listings: listings.data ?? [],
    members: members.data ?? [],
    overview: (overview.data ?? null) as unknown as VendorOverview | null,
  };
}

// ---------- users -------------------------------------------------------------------------------
export async function listUsers(search: string, page: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: search || (null as unknown as string),
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error(`Failed to load users: ${error.message}`);
  return { rows: data ?? [], total: Number(data?.[0]?.total_count ?? 0) };
}

export type UserOverview = {
  profile: {
    id: string;
    email: string | null;
    full_name: string | null;
    display_name: string | null;
    phone: string | null;
    preferred_locale: string;
    created_at: string;
    blocked_at: string | null;
    blocked_reason: string | null;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
  };
  roles: { code: string; granted_at: string }[];
  memberships: {
    organization_id: string;
    organization_name: string;
    organization_status: string;
    role: string;
    status: string;
  }[];
  enquiries: { id: string; listing: string; vendor: string; event_date: string; status: string; created_at: string }[];
  bookings: {
    id: string;
    listing: string | null;
    vendor: string;
    event_date: string;
    status: string;
    total_paise: number | null;
    paid_paise: number | null;
  }[];
  payments:
    | {
        id: string;
        vendor: string;
        kind: string;
        method: string;
        status: string;
        amount_paise: number;
        receipt_number: string | null;
        paid_at: string | null;
        created_at: string;
      }[]
    | null;
  events: number;
  activity: { id: number; occurred_at: string; action: string; entity_table: string }[] | null;
};

/** The read-only support view. Each call is written to the audit log (support.user_viewed). */
export async function getUserOverview(userId: string): Promise<UserOverview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_user_overview", { p_user_id: userId });
  if (error) {
    if (error.code === "P0002") return null;
    throw new Error(`Failed to load user: ${error.message}`);
  }
  return data as unknown as UserOverview;
}

// ---------- audit log -------------------------------------------------------------------------------
export async function listAudit(f: AuditFilters) {
  const supabase = await createClient();
  let q = supabase
    .from("audit_logs")
    .select(
      "id, occurred_at, actor_user_id, actor_db_role, organization_id, action, entity_table, entity_id, changed_fields, old_data, new_data, metadata",
      { count: "estimated" },
    )
    .order("id", { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.table) q = q.eq("entity_table", f.table);
  if (f.action) q = q.ilike("action", `${f.action}%`);
  if (f.actor) q = q.eq("actor_user_id", f.actor);
  if (f.entity) q = q.eq("entity_id", f.entity);
  if (f.org) q = q.eq("organization_id", f.org);
  if (f.from) q = q.gte("occurred_at", dayStart(f.from));
  if (f.to) q = q.lt("occurred_at", dayEnd(f.to));
  const { data, error, count } = await q;
  if (error) throw new Error(`Failed to load audit log: ${error.message}`);
  const rows = data ?? [];

  // Names for the people involved (needs users.read; ids are shown otherwise).
  const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: people } = await supabase.from("profiles").select("id, full_name, email").in("id", actorIds);
    for (const p of people ?? []) names.set(p.id, p.full_name || (p.email as string) || p.id);
  }
  return { rows, total: count ?? rows.length, names };
}

export async function listAuditTables(): Promise<string[]> {
  // Fixed list of audited tables (kept in step with the audit triggers).
  return [
    "organizations",
    "organization_members",
    "branches",
    "business_profiles",
    "business_documents",
    "services",
    "bookable_resources",
    "resource_reservations",
    "enquiries",
    "quotations",
    "booking_items",
    "payments",
    "refunds",
    "events",
    "event_members",
    "staff_profiles",
    "jobs",
    "job_assignments",
    "vendor_expenses",
    "user_role_assignments",
    "auspicious_dates",
    "profiles",
  ];
}

// ---------- payments ledger ------------------------------------------------------------------------------
export async function listLedger(f: LedgerFilters) {
  const supabase = await createClient();
  let q = supabase
    .from("payments")
    .select(
      "id, kind, method, status, offline_mode, amount_paise, currency, razorpay_payment_id, receipt_number, reference, paid_at, created_at, organization_id, booking_item_id, organizations(name), booking_items(snapshot, event_date)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.status) q = q.eq("status", f.status);
  if (f.method) q = q.eq("method", f.method);
  if (f.vendor) q = q.eq("organization_id", f.vendor);
  if (f.from) q = q.gte("created_at", dayStart(f.from));
  if (f.to) q = q.lt("created_at", dayEnd(f.to));
  const { data, error, count } = await q;
  if (error) throw new Error(`Failed to load payments: ${error.message}`);
  const rows = (data ?? []).map((p) => {
    const item = p.booking_items as unknown as { snapshot: unknown; event_date: string } | null;
    return {
      ...p,
      vendor: (p.organizations as unknown as { name: string } | null)?.name ?? "—",
      listing: item ? (bookingSnapshotOf(item.snapshot as never).listing?.title ?? "—") : "—",
      eventDate: item?.event_date ?? null,
    };
  });
  return { rows, total: count ?? rows.length };
}

/** Totals for the same filters (paid money only, and refunds processed in the same period). */
export async function ledgerTotals(f: LedgerFilters) {
  const supabase = await createClient();
  let pays = supabase.from("payments").select("method, amount_paise").eq("status", "paid").limit(20000);
  let refs = supabase.from("refunds").select("method, amount_paise").eq("status", "processed").limit(20000);
  if (f.method) {
    pays = pays.eq("method", f.method);
    refs = refs.eq("method", f.method);
  }
  if (f.vendor) {
    pays = pays.eq("organization_id", f.vendor);
    refs = refs.eq("organization_id", f.vendor);
  }
  if (f.from) {
    pays = pays.gte("paid_at", dayStart(f.from));
    refs = refs.gte("processed_at", dayStart(f.from));
  }
  if (f.to) {
    pays = pays.lt("paid_at", dayEnd(f.to));
    refs = refs.lt("processed_at", dayEnd(f.to));
  }
  const [p, r] = await Promise.all([pays, refs]);
  if (p.error) throw new Error(`Failed to total payments: ${p.error.message}`);
  if (r.error) throw new Error(`Failed to total refunds: ${r.error.message}`);
  const sum = (rows: { amount_paise: number; method: string }[], method?: string) =>
    rows.filter((x) => !method || x.method === method).reduce((s, x) => s + x.amount_paise, 0);
  return {
    online: sum(p.data ?? [], "razorpay"),
    offline: sum(p.data ?? [], "offline"),
    refunded: sum(r.data ?? []),
  };
}

export async function listVendorOptions() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").select("id, name").order("name").limit(1000);
  if (error) throw new Error(`Failed to load vendors: ${error.message}`);
  return data ?? [];
}

// ---------- taxonomy (all rows, including hidden ones) ------------------------------------------------------
export async function listTaxonomy() {
  const supabase = await createClient();
  const [categories, services, cities, areas] = await Promise.all([
    supabase
      .from("business_categories")
      .select("id, slug, name, name_i18n, description, icon, display_order, is_launch_focus, active")
      .order("display_order")
      .order("name"),
    supabase
      .from("service_categories")
      .select(
        "id, business_category_id, slug, name, name_i18n, description, default_booking_mode, resource_kind_hint, display_order, active",
      )
      .order("display_order")
      .order("name"),
    supabase
      .from("cities")
      .select("id, slug, name, name_i18n, state, state_code, alt_names, is_launch_city, active")
      .order("name"),
    supabase.from("areas").select("id, city_id, slug, name, name_i18n, pincode, active").order("name"),
  ]);
  for (const r of [categories, services, cities, areas]) {
    if (r.error) throw new Error(`Failed to load categories & cities: ${r.error.message}`);
  }
  return {
    categories: categories.data ?? [],
    services: services.data ?? [],
    cities: cities.data ?? [],
    areas: areas.data ?? [],
  };
}
