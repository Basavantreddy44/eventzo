import "server-only";

import { createClient } from "@/lib/supabase/server";
import { bookingSnapshotOf } from "@/features/bookings/queries";
import { parseTstzRange } from "@/lib/datetime";

/**
 * Staff, jobs and the staff app. Reads run with the user's session: RLS gives
 * managers their organisation's (or branch's) rows and staff only their own.
 */

export async function listStaff(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, full_name, phone, skill, branch_id, member_id, day_rate_paise, currency, notes, active")
    .eq("organization_id", organizationId)
    .order("active", { ascending: false })
    .order("full_name");
  if (error) throw new Error(`Failed to load staff: ${error.message}`);
  return data ?? [];
}

/** Active team logins (for linking a roster entry to an Eventzo account). */
export async function listMemberOptions(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("org_member_directory", { p_organization_id: organizationId });
  if (error) throw new Error(`Failed to load team: ${error.message}`);
  return (data ?? [])
    .filter((m) => m.status === "active")
    .map((m) => ({ id: m.member_id, label: m.full_name || m.display_name || m.email || m.role, role: m.role }));
}

const ASSIGNMENT_FIELDS =
  "id, staff_profile_id, role_label, call_time, pay_paise, status, staff_note, responded_at, checked_in_at, completed_at, staff_profiles(full_name, skill), vendor_expenses(id, amount_paise)";

export type JobAssignmentView = {
  id: string;
  staff_profile_id: string;
  role_label: string | null;
  call_time: string | null;
  pay_paise: number | null;
  status: string;
  staff_note: string | null;
  staffName: string;
  staffSkill: string | null;
  paidOut: number | null;
};

type RawAssignment = {
  id: string;
  staff_profile_id: string;
  role_label: string | null;
  call_time: string | null;
  pay_paise: number | null;
  status: string;
  staff_note: string | null;
  staff_profiles: { full_name: string; skill: string | null } | null;
  vendor_expenses: { id: string; amount_paise: number } | { id: string; amount_paise: number }[] | null;
};

function toAssignmentView(a: RawAssignment): JobAssignmentView {
  const payout = Array.isArray(a.vendor_expenses) ? a.vendor_expenses[0] : a.vendor_expenses;
  return {
    id: a.id,
    staff_profile_id: a.staff_profile_id,
    role_label: a.role_label,
    call_time: a.call_time,
    pay_paise: a.pay_paise,
    status: a.status,
    staff_note: a.staff_note,
    staffName: a.staff_profiles?.full_name ?? "—",
    staffSkill: a.staff_profiles?.skill ?? null,
    paidOut: payout?.amount_paise ?? null,
  };
}

export type ScheduleJob = {
  key: string;
  kind: "booking" | "offline";
  bookingItemId: string | null;
  reservationId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  branchId: string | null;
  guests: number | null;
  notes: string | null;
  job: { id: string; site_address: string | null; instructions: string | null; status: string } | null;
  assignments: JobAssignmentView[];
};

/**
 * Upcoming work: confirmed bookings and offline bookings in [from, to), with
 * their job sheet and staff. Jobs are created lazily on first assignment.
 */
export async function listSchedule(
  organizationId: string,
  branchId: string | null,
  from: string,
  to: string,
): Promise<ScheduleJob[]> {
  const supabase = await createClient();
  const range = `[${from},${to})`;
  let itemsQ = supabase
    .from("booking_items")
    .select("id, branch_id, period, guests, snapshot")
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .overlaps("period", range)
    .limit(300);
  if (branchId) itemsQ = itemsQ.eq("branch_id", branchId);
  const [items, offline, jobs] = await Promise.all([
    itemsQ,
    supabase
      .from("resource_reservations")
      .select("id, period, notes, bookable_resources(name, branch_id)")
      .eq("organization_id", organizationId)
      .eq("source", "offline")
      .eq("status", "confirmed")
      .overlaps("period", range)
      .limit(300),
    supabase
      .from("jobs")
      .select(
        `id, booking_item_id, reservation_id, site_address, instructions, status, job_assignments(${ASSIGNMENT_FIELDS})`,
      )
      .eq("organization_id", organizationId)
      .overlaps("period", range)
      .limit(600),
  ]);
  if (items.error) throw new Error(`Failed to load bookings: ${items.error.message}`);
  if (offline.error) throw new Error(`Failed to load offline bookings: ${offline.error.message}`);
  if (jobs.error) throw new Error(`Failed to load jobs: ${jobs.error.message}`);

  const jobByAnchor = new Map<string, (typeof jobs.data)[number]>();
  for (const j of jobs.data ?? []) jobByAnchor.set(j.booking_item_id ?? j.reservation_id ?? "", j);

  const out: ScheduleJob[] = [];
  const push = (base: Omit<ScheduleJob, "job" | "assignments">, anchor: string) => {
    const j = jobByAnchor.get(anchor);
    out.push({
      ...base,
      job: j ? { id: j.id, site_address: j.site_address, instructions: j.instructions, status: j.status } : null,
      assignments: ((j?.job_assignments ?? []) as unknown as RawAssignment[])
        .filter((a) => a.status !== "cancelled")
        .map(toAssignmentView)
        .sort((a, b) => a.staffName.localeCompare(b.staffName)),
    });
  };
  for (const b of items.data ?? []) {
    const r = parseTstzRange(String(b.period));
    if (!r) continue;
    push(
      {
        key: `b-${b.id}`,
        kind: "booking",
        bookingItemId: b.id,
        reservationId: null,
        title: bookingSnapshotOf(b.snapshot).listing?.title ?? "—",
        startsAt: r.start.toISOString(),
        endsAt: r.end.toISOString(),
        branchId: b.branch_id,
        guests: b.guests,
        notes: null,
      },
      b.id,
    );
  }
  for (const o of offline.data ?? []) {
    const r = parseTstzRange(String(o.period));
    const res = o.bookable_resources as { name: string; branch_id: string | null } | null;
    if (!r || (branchId && res?.branch_id && res.branch_id !== branchId)) continue;
    push(
      {
        key: `r-${o.id}`,
        kind: "offline",
        bookingItemId: null,
        reservationId: o.id,
        title: res?.name ?? "—",
        startsAt: r.start.toISOString(),
        endsAt: r.end.toISOString(),
        branchId: res?.branch_id ?? null,
        guests: null,
        notes: o.notes,
      },
      o.id,
    );
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** The job sheet + staff for one booking item (vendor booking page). */
export async function getJobForBooking(bookingItemId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(`id, site_address, instructions, status, job_assignments(${ASSIGNMENT_FIELDS})`)
    .eq("booking_item_id", bookingItemId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load job: ${error.message}`);
  if (!data) return null;
  return {
    job: { id: data.id, site_address: data.site_address, instructions: data.instructions, status: data.status },
    assignments: ((data.job_assignments ?? []) as unknown as RawAssignment[])
      .filter((a) => a.status !== "cancelled")
      .map(toAssignmentView),
  };
}

/** Active staff the caller may assign (RLS: owner = all, manager = business-wide + own branches). */
export async function listAssignableStaff(organizationId: string, branchId: string | null) {
  const staff = await listStaff(organizationId);
  return staff
    .filter((s) => s.active && (!branchId || !s.branch_id || s.branch_id === branchId))
    .map((s) => ({ id: s.id, label: s.skill ? `${s.full_name} · ${s.skill}` : s.full_name }));
}

/** The signed-in person's jobs (staff app). */
export async function getMyJobs() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_jobs", {});
  if (error) throw new Error(`Failed to load jobs: ${error.message}`);
  return data ?? [];
}
