"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { dispatchOutbox, getDeliveryMode } from "../lib/delivery";
import { PREFERENCE_CATEGORIES, PREFERENCE_CHANNELS } from "../lib/templates";

export async function markNotificationsRead(ids?: string[]): Promise<ActionResult<number>> {
  if (
    ids !== undefined &&
    (!Array.isArray(ids) || ids.length > 200 || !ids.every((id) => z.uuid().safeParse(id).success))
  )
    return fail("errors.invalidInput");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notifications_read", {
    p_ids: (ids ?? null) as unknown as string[],
  });
  return error ? fail(`errors.${mapDbError(error)}`) : ok(Number(data));
}

export async function setWhatsappConsent(granted: boolean): Promise<ActionResult> {
  if (typeof granted !== "boolean") return fail("errors.invalidInput");
  const supabase = await createClient();
  const ua = (await headers()).get("user-agent")?.slice(0, 500) ?? null;
  const { error } = await supabase.rpc("set_whatsapp_consent", {
    p_granted: granted,
    p_user_agent: ua as unknown as string,
  });
  if (error?.code === "22023") return fail("notifications.needPhone");
  return error ? fail(`errors.${mapDbError(error)}`) : ok(undefined);
}

const preferenceSchema = z.object({
  channel: z.enum(PREFERENCE_CHANNELS),
  category: z.enum(PREFERENCE_CATEGORIES),
  enabled: z.boolean(),
});

export async function setNotificationPreference(input: z.infer<typeof preferenceSchema>): Promise<ActionResult> {
  const parsed = preferenceSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return fail("errors.unauthenticated");
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: data.user.id, ...parsed.data }, { onConflict: "user_id,channel,category" });
  return error ? fail(`errors.${mapDbError(error)}`) : ok(undefined);
}

/** Operators: deliver queued WhatsApp/email messages now (instead of waiting for the scheduled run). */
export async function processOutboxNow(): Promise<ActionResult<{ sent: number; failed: number }>> {
  const user = await getCurrentUser();
  if (!user) return fail("errors.unauthenticated");
  if (!hasPermission(user.access, "notifications.manage")) return fail("errors.forbidden");
  if (!getDeliveryMode()) return fail("outbox.noProvider");
  try {
    return ok(await dispatchOutbox(100));
  } catch (e) {
    console.error("Outbox dispatch failed", e);
    return fail("errors.unknown");
  }
}
