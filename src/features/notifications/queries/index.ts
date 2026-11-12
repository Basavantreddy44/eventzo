import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function listNotifications(userId: string, limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, category, kind, params, link, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load notifications: ${error.message}`);
  return data ?? [];
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

/** Phone, current WhatsApp opt-in and saved per-channel choices. */
export async function getNotificationSettings(userId: string) {
  const supabase = await createClient();
  const [profile, consent, prefs] = await Promise.all([
    supabase.from("profiles").select("phone").eq("id", userId).maybeSingle(),
    supabase
      .from("consent_records")
      .select("granted, created_at")
      .eq("user_id", userId)
      .eq("purpose", "whatsapp_updates")
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("notification_preferences").select("channel, category, enabled").eq("user_id", userId),
  ]);
  return {
    phone: profile.data?.phone ?? null,
    whatsappOptIn: consent.data?.granted ?? false,
    whatsappOptInAt: consent.data?.granted ? consent.data.created_at : null,
    preferences: prefs.data ?? [],
  };
}

/** Operators (notifications.manage): the WhatsApp/email outbox. */
export async function listOutbox(status: "all" | "queued" | "failed") {
  const supabase = await createClient();
  let q = supabase
    .from("notification_outbox")
    .select("id, channel, to_address, template, status, attempts, provider, last_error, sent_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load outbox: ${error.message}`);
  return data ?? [];
}

export async function outboxCounts() {
  const supabase = await createClient();
  const count = async (status: "queued" | "sent" | "failed") =>
    (await supabase.from("notification_outbox").select("id", { count: "exact", head: true }).eq("status", status))
      .count ?? 0;
  const [queued, sent, failed] = await Promise.all([count("queued"), count("sent"), count("failed")]);
  return { queued, sent, failed };
}
