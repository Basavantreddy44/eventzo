"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { LISTINGS_TAG } from "@/features/discovery/queries";

/** Staff-side verification actions (verification.manage). The RPCs re-check the permission. */
async function requireReviewer(): Promise<ActionResult<never> | null> {
  const user = await getCurrentUser();
  if (!user) return fail("errors.unauthenticated");
  if (!hasPermission(user.access, "verification.manage")) return fail("errors.forbidden");
  return null;
}

export async function reviewDocument(documentId: string, approve: boolean, reason: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(documentId).success) return fail("errors.invalidInput");
  if (!approve && reason.trim() === "") return fail("admin.verification.reasonRequired");
  const denied = await requireReviewer();
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_business_document", {
    p_document_id: documentId,
    p_approve: approve,
    p_reason: reason.trim() || undefined,
  });
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(undefined);
}

export async function decideVerification(
  organizationId: string,
  status: "verified" | "rejected",
  reason: string,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(organizationId).success) return fail("errors.invalidInput");
  if (status === "rejected" && reason.trim() === "") return fail("admin.verification.reasonRequired");
  const denied = await requireReviewer();
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_organization_verification", {
    p_organization_id: organizationId,
    p_status: status,
    p_reason: reason.trim() || undefined,
  });
  if (error?.code === "23514") return fail("admin.verification.needsApproved");
  if (error) return fail(`errors.${mapDbError(error)}`);
  updateTag(LISTINGS_TAG); // the Verified badge and ranking change
  return ok(undefined);
}

export async function getReviewDocumentUrl(documentId: string): Promise<ActionResult<string>> {
  if (!z.uuid().safeParse(documentId).success) return fail("errors.invalidInput");
  const denied = await requireReviewer();
  if (denied) return denied;

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("business_documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return fail("errors.notFound");
  const { data, error } = await supabase.storage.from("business-documents").createSignedUrl(doc.storage_path, 120);
  if (error || !data) return fail("vendor.documents.openFailed");
  return ok(data.signedUrl);
}
