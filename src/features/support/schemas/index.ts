import { z } from "zod";

export const SUPPORT_TOPICS = ["vendor_not_responding", "change_date", "cancel", "problem", "other"] as const;
export const SUPPORT_STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;
export const SUPPORT_PRIORITIES = ["normal", "high"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const openTicketSchema = z.object({
  itemId: z.uuid().nullable(),
  topic: z.enum(SUPPORT_TOPICS, { error: "support.topicRequired" }),
  body: z.string().trim().min(10, "support.bodyTooShort").max(2000, "validation.tooLong"),
  idempotencyKey: z.string().min(8).max(100),
});
export type OpenTicketInput = z.infer<typeof openTicketSchema>;

export const supportMessageSchema = z.object({
  ticketId: z.uuid(),
  body: z.string().trim().min(1, "validation.required").max(4000, "validation.tooLong"),
  internal: z.boolean().default(false),
});
export type SupportMessageInput = z.input<typeof supportMessageSchema>;

export const updateTicketSchema = z.object({
  ticketId: z.uuid(),
  status: z.enum(SUPPORT_STATUSES),
  priority: z.enum(SUPPORT_PRIORITIES),
  assignedTo: z.uuid().nullable(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

/** Hours until the first reply is due; mirrors private.support_sla_hours(). */
export function slaHours(topic: SupportTopic): number {
  return topic === "problem" || topic === "vendor_not_responding" ? 4 : 24;
}

/** Overdue = still waiting for the team's first reply after the target time. */
export function isOverdue(
  t: { status: string; sla_due_at: string; first_response_at: string | null },
  now: Date = new Date(),
): boolean {
  return (
    !t.first_response_at &&
    !["resolved", "closed"].includes(t.status) &&
    new Date(t.sla_due_at).getTime() < now.getTime()
  );
}

export function ticketRef(refNo: number): string {
  return `#${refNo}`;
}
