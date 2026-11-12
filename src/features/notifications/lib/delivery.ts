import "server-only";

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPaise } from "@/lib/money";
import { isKnownKind, notificationValues, whatsappVariables } from "./templates";

/**
 * How WhatsApp/email messages leave the outbox:
 * - "simulator" when NOTIFICATIONS_SIMULATOR=true: messages are marked sent
 *   (provider "simulator") without contacting anyone. For demos and testing.
 * - null: no provider yet, so messages stay queued (visible in /admin/notifications).
 *
 * A real WhatsApp provider (Meta Cloud API or a BSP such as Gupshup/Interakt)
 * and an email provider plug in here once accounts and approved templates exist.
 */
export type DeliveryMode = "simulator";

export function getDeliveryMode(): DeliveryMode | null {
  return process.env.NOTIFICATIONS_SIMULATOR?.trim().toLowerCase() === "true" ? "simulator" : null;
}

type OutboxRow = { id: string; channel: string; template: string; params: unknown; to_address: string };

async function deliver(mode: DeliveryMode, row: OutboxRow): Promise<{ providerId: string }> {
  if (!isKnownKind(row.template)) throw new Error(`Unknown template ${row.template}`);
  // What a provider would receive (template variables in approved order).
  whatsappVariables(
    row.template,
    notificationValues(row.params, (p) => formatPaise(p)),
  );
  if (mode === "simulator") return { providerId: `sim_${randomBytes(9).toString("hex")}` };
  throw new Error(`Unsupported delivery mode ${mode satisfies never}`);
}

/** Claims due outbox rows and delivers them. Service role; callers must authorise first. */
export async function dispatchOutbox(limit = 50): Promise<{ sent: number; failed: number }> {
  const mode = getDeliveryMode();
  if (!mode) return { sent: 0, failed: 0 };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_outbox", { p_limit: limit });
  if (error) throw new Error(`claim_outbox failed: ${error.message}`);

  let sent = 0;
  let failed = 0;
  for (const row of data ?? []) {
    try {
      const { providerId } = await deliver(mode, row);
      await admin.rpc("complete_outbox", {
        p_id: row.id,
        p_success: true,
        p_provider: mode,
        p_provider_message_id: providerId,
        p_error: null as unknown as string,
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      await admin.rpc("complete_outbox", {
        p_id: row.id,
        p_success: false,
        p_provider: mode,
        p_provider_message_id: null as unknown as string,
        p_error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { sent, failed };
}
