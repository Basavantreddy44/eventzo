"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { dbFail, requireVendorActor } from "../lib/actor";
import { isOrgObjectPath, registerDocumentSchema, type RegisterDocumentInput } from "../schemas";

const BUCKET = "business-documents";

/**
 * Called after the browser uploaded the file straight to the private bucket
 * (storage RLS allows owners to write only into their own org folder).
 * Records the document; the DB puts the vendor in the review queue.
 */
export async function registerDocument(input: RegisterDocumentInput): Promise<ActionResult> {
  const parsed = registerDocumentSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput");
  const actor = await requireVendorActor(["owner"]);
  if (!actor.ok) return actor.result;
  const orgId = actor.ctx.membership.organization_id;
  if (!isOrgObjectPath(parsed.data.storagePath, orgId)) return fail("errors.forbidden");

  const supabase = await createClient();
  const { error } = await supabase.from("business_documents").insert({
    organization_id: orgId,
    document_type: parsed.data.documentType,
    storage_path: parsed.data.storagePath,
    file_name: parsed.data.fileName,
    mime_type: parsed.data.mimeType,
    size_bytes: parsed.data.sizeBytes,
    uploaded_by: actor.ctx.user.id,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([parsed.data.storagePath]);
    return dbFail(error);
  }
  return ok(undefined);
}

/** Short-lived signed link (2 minutes) — documents are never public. */
export async function getDocumentUrl(documentId: string): Promise<ActionResult<string>> {
  if (!z.uuid().safeParse(documentId).success) return fail("errors.invalidInput");
  const actor = await requireVendorActor(["owner"]);
  if (!actor.ok) return actor.result;

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("business_documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("organization_id", actor.ctx.membership.organization_id)
    .maybeSingle();
  if (!doc) return fail("errors.notFound");

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 120);
  if (error || !data) return fail("vendor.documents.openFailed");
  return ok(data.signedUrl);
}

/** Only documents not yet reviewed can be deleted (RLS enforces the same). */
export async function deleteDocument(documentId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(documentId).success) return fail("errors.invalidInput");
  const actor = await requireVendorActor(["owner"]);
  if (!actor.ok) return actor.result;

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("business_documents")
    .select("storage_path, status")
    .eq("id", documentId)
    .eq("organization_id", actor.ctx.membership.organization_id)
    .maybeSingle();
  if (!doc) return fail("errors.notFound");
  if (doc.status !== "uploaded") return fail("errors.forbidden");

  const { error } = await supabase.from("business_documents").delete().eq("id", documentId);
  if (error) return dbFail(error);
  await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  return ok(undefined);
}
