"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { appCookies } from "@/config/site";
import { getPublicEnv } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/features/auth/schemas";
import { dbFail, requireVendorActor } from "../lib/actor";
import { inviteSchema, type InviteInput } from "../schemas";

export type InviteOutcome = "emailed" | "existing" | "not_emailed";

/**
 * Owner invites by email. The invitation itself is created by the
 * `create_invitation` RPC (RLS + validation in the database). Then:
 *  - an existing Eventzo user simply sees it in their account;
 *  - a new person gets a Supabase Auth invitation email that lets them set a
 *    password and land on the invitation.
 */
export async function inviteMember(input: InviteInput): Promise<ActionResult<InviteOutcome>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", toFieldErrors(parsed.error));
  const actor = await requireVendorActor(["owner"]);
  if (!actor.ok) return actor.result;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_invitation", {
    p_organization_id: actor.ctx.membership.organization_id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_branch_ids: parsed.data.branchIds,
  });
  if (error?.code === "23505") {
    return fail(
      error.message.includes("already a team member") ? "vendor.team.alreadyMember" : "vendor.team.alreadyInvited",
    );
  }
  if (error) return dbFail(error);

  // Service role is used only to look up / invite the account by email —
  // authorisation already happened above (owner + RPC).
  try {
    const admin = createAdminClient();
    const { data: existing } = await admin.from("profiles").select("id").eq("email", parsed.data.email).maybeSingle();
    if (existing) return ok("existing");

    const redirectTo = new URL("/auth/confirm", getPublicEnv().NEXT_PUBLIC_SITE_URL);
    redirectTo.searchParams.set("next", "/reset-password");
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo: redirectTo.toString(),
    });
    return ok(inviteError ? "not_emailed" : "emailed");
  } catch (e) {
    console.error("invite email failed", e);
    return ok("not_emailed");
  }
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(invitationId).success) return fail("errors.invalidInput");
  const actor = await requireVendorActor(["owner"]);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: invitationId });
  if (error) return dbFail(error);
  return ok(undefined);
}

export async function changeMemberRole(
  memberId: string,
  role: "owner" | "branch_manager" | "staff",
): Promise<ActionResult> {
  if (!z.uuid().safeParse(memberId).success || !["owner", "branch_manager", "staff"].includes(role)) {
    return fail("errors.invalidInput");
  }
  const actor = await requireVendorActor(["owner"]);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("id", memberId)
    .eq("organization_id", actor.ctx.membership.organization_id)
    .select("id");
  if (error?.code === "23514") return fail("vendor.team.lastOwner");
  if (error) return dbFail(error);
  if (!data?.length) return fail("errors.notFound");
  return ok(undefined);
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(memberId).success) return fail("errors.invalidInput");
  const actor = await requireVendorActor(["owner"]);
  if (!actor.ok) return actor.result;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", memberId)
    .eq("organization_id", actor.ctx.membership.organization_id)
    .select("id");
  if (error?.code === "23514") return fail("vendor.team.lastOwner");
  if (error) return dbFail(error);
  if (!data?.length) return fail("errors.notFound");
  return ok(undefined);
}

/** Invitee accepts / declines (from the account page). Accepting switches to that business. */
export async function respondToInvitation(invitationId: string, accept: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(invitationId).success) return fail("errors.invalidInput");
  const user = await getCurrentUser();
  if (!user) return fail("errors.unauthenticated");

  const supabase = await createClient();
  const { data: organizationId, error } = await supabase.rpc("respond_invitation", {
    p_invitation_id: invitationId,
    p_accept: accept,
  });
  if (error) return dbFail(error);

  if (accept && organizationId) {
    const store = await cookies();
    store.set(appCookies.activeOrganization, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    store.delete(appCookies.activeBranch);
  }
  return ok(undefined);
}
