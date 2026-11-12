"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { zonedToIso } from "@/features/enquiries/schemas";
import { dbFail, requireVendorActor } from "@/features/vendor/lib/actor";
import {
  assignmentEditSchema,
  assignSchema,
  jobDetailsSchema,
  jobResponseSchema,
  payToPaise,
  staffSchema,
  toStaffRow,
  type AssignInput,
  type AssignmentEditInput,
  type JobDetailsInput,
  type JobResponseInput,
  type StaffInput,
} from "../schemas";

const NULL = null as unknown as string; // SQL accepts NULL for optional RPC arguments
const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;
const MANAGERS = ["owner", "branch_manager"] as const;

// ---------- roster ---------------------------------------------------------------------
/** Owners for everyone; branch managers for staff of their own branches (RLS). */
export async function saveStaff(input: StaffInput): Promise<ActionResult> {
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const orgId = actor.ctx.membership.organization_id;
  const supabase = await createClient();
  const row = toStaffRow(parsed.data);

  const res = parsed.data.id
    ? await supabase
        .from("staff_profiles")
        .update(row)
        .eq("id", parsed.data.id)
        .eq("organization_id", orgId)
        .select("id")
    : await supabase
        .from("staff_profiles")
        .insert({ ...row, organization_id: orgId, created_by: actor.ctx.user.id })
        .select("id");
  if (res.error?.code === "23505") return fail("errors.invalidInput", { memberId: "staff.memberTaken" });
  if (res.error?.code === "42501") return fail("staff.branchOnly");
  if (res.error) return dbFail(res.error);
  if (!res.data?.length) return fail("errors.forbidden");
  return ok(undefined);
}

export async function setStaffActive(staffId: string, active: boolean): Promise<ActionResult> {
  if (!isUuid(staffId)) return fail("errors.invalidInput");
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_profiles")
    .update({ active })
    .eq("id", staffId)
    .eq("organization_id", actor.ctx.membership.organization_id)
    .select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("errors.forbidden");
  return ok(undefined);
}

// ---------- jobs & assignments ------------------------------------------------------------
function callTimeIso(date: string, time: string): string | null {
  return date && time ? zonedToIso(date, time) : null;
}

export async function assignStaff(input: AssignInput): Promise<ActionResult> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const v = parsed.data;
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();

  let jobId = v.jobId;
  if (!jobId) {
    const { data, error } = await supabase.rpc("ensure_job", {
      p_booking_item_id: v.bookingItemId || NULL,
      p_reservation_id: v.reservationId || NULL,
    });
    if (error?.code === "22023") return fail("staff.notStaffable");
    if (error) return dbFail(error);
    jobId = data as string;
  }
  const { error } = await supabase.rpc("assign_staff", {
    p_job_id: jobId,
    p_staff_profile_id: v.staffProfileId,
    p_role_label: v.roleLabel || NULL,
    p_call_time: callTimeIso(v.callDate, v.callTime) ?? NULL,
    p_pay_paise: payToPaise(v.pay) ?? (null as unknown as number),
  });
  if (error?.code === "23P01") return fail("errors.invalidInput", { staffProfileId: "staff.busy" });
  if (error?.code === "23505") return fail("errors.invalidInput", { staffProfileId: "staff.alreadyAssigned" });
  if (error?.code === "22023") {
    if (/call time/i.test(error.message)) return fail("errors.invalidInput", { callTime: "staff.callTimeRange" });
    if (/branch/i.test(error.message)) return fail("errors.invalidInput", { staffProfileId: "staff.otherBranch" });
    return fail("staff.jobClosed");
  }
  return error ? dbFail(error) : ok(undefined);
}

export async function updateAssignment(input: AssignmentEditInput): Promise<ActionResult> {
  const parsed = assignmentEditSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_assignment", {
    p_assignment_id: v.assignmentId,
    p_role_label: v.roleLabel || NULL,
    p_call_time: callTimeIso(v.callDate, v.callTime) ?? NULL,
    p_pay_paise: payToPaise(v.pay) ?? (null as unknown as number),
  });
  if (error?.code === "22023") {
    if (/call time/i.test(error.message)) return fail("errors.invalidInput", { callTime: "staff.callTimeRange" });
    return fail("staff.jobClosed");
  }
  return error ? dbFail(error) : ok(undefined);
}

export async function unassignStaff(assignmentId: string): Promise<ActionResult> {
  if (!isUuid(assignmentId)) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { error } = await supabase.rpc("unassign_staff", { p_assignment_id: assignmentId });
  return error ? dbFail(error) : ok(undefined);
}

export async function saveJobDetails(input: JobDetailsInput): Promise<ActionResult> {
  const parsed = jobDetailsSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({
      site_address: parsed.data.siteAddress || null,
      instructions: parsed.data.instructions || null,
    })
    .eq("id", parsed.data.jobId)
    .eq("organization_id", actor.ctx.membership.organization_id)
    .select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("errors.forbidden");
  return ok(undefined);
}

/** Creates the job sheet (if needed) so its site & instructions can be filled before staffing. */
export async function ensureJob(anchor: {
  bookingItemId?: string;
  reservationId?: string;
}): Promise<ActionResult<string>> {
  const b = anchor.bookingItemId ?? "";
  const r = anchor.reservationId ?? "";
  if ((b && !isUuid(b)) || (r && !isUuid(r)) || !!b === !!r) return fail("errors.invalidInput");
  const actor = await requireVendorActor(MANAGERS);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_job", {
    p_booking_item_id: b || NULL,
    p_reservation_id: r || NULL,
  });
  if (error?.code === "22023") return fail("staff.notStaffable");
  return error ? dbFail(error) : ok(data as string);
}

// ---------- staff app ------------------------------------------------------------------------
export async function respondJob(input: JobResponseInput): Promise<ActionResult<string>> {
  const parsed = jobResponseSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_job", {
    p_assignment_id: parsed.data.assignmentId,
    p_action: parsed.data.action,
    p_note: parsed.data.note || NULL,
  });
  if (error?.code === "22023") {
    if (/check-in/i.test(error.message)) return fail("jobs.checkInLater");
    if (/not started/i.test(error.message)) return fail("jobs.notStarted");
    if (/cancelled/i.test(error.message)) return fail("jobs.cancelledJob");
    return fail("jobs.stepNotPossible");
  }
  return error ? dbFail(error) : ok(data as string);
}
