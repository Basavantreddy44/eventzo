"use server";

import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import {
  openTicketSchema,
  supportMessageSchema,
  updateTicketSchema,
  type OpenTicketInput,
  type SupportMessageInput,
  type UpdateTicketInput,
} from "../schemas";

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  return Object.fromEntries(issues.map((i) => [String(i.path[0] ?? "form"), i.message]));
}

/** C10: the Help button. Returns the new ticket id. */
export async function openSupportTicket(input: OpenTicketInput): Promise<ActionResult<string>> {
  const parsed = openTicketSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", fieldErrors(parsed.error.issues));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_support_ticket", {
    // null = a general request; the generated type marks every argument without a default as non-null.
    p_booking_item_id: parsed.data.itemId as string,
    p_topic: parsed.data.topic,
    p_body: parsed.data.body,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(data as string);
}

export async function postSupportMessage(input: SupportMessageInput): Promise<ActionResult> {
  const parsed = supportMessageSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", fieldErrors(parsed.error.issues));
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_support_message", {
    p_ticket_id: parsed.data.ticketId,
    p_body: parsed.data.body,
    p_internal: parsed.data.internal,
  });
  if (error) return fail(error.code === "22023" ? "support.closedTicket" : `errors.${mapDbError(error)}`);
  return ok(undefined);
}

export async function updateSupportTicket(input: UpdateTicketInput): Promise<ActionResult> {
  const parsed = updateTicketSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", fieldErrors(parsed.error.issues));
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_support_ticket", {
    p_ticket_id: parsed.data.ticketId,
    p_status: parsed.data.status,
    p_priority: parsed.data.priority,
    p_assigned_to: parsed.data.assignedTo as string, // null = unassign
  });
  if (error) return fail(`errors.${mapDbError(error)}`);
  return ok(undefined);
}
