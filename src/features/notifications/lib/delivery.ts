import "server-only";

import { randomBytes } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { getPublicEnv } from "@/lib/env";
import { routing, type AppLocale } from "@/i18n/routing";
import { siteConfig } from "@/config/site";
import {
  isKnownKind,
  NOTIFICATION_KINDS,
  notificationValues,
  whatsappVariables,
  type NotificationKind,
} from "./templates";

/**
 * How WhatsApp and email messages leave the outbox. Each channel has its own
 * provider and works on its own (Roadmap A3/A4):
 *
 * - WhatsApp → Meta Cloud API when WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID
 *   are set. Business messages must use templates approved in WhatsApp Manager
 *   (names and variable order in templates.ts).
 * - Email → Resend when RESEND_API_KEY + EMAIL_FROM are set.
 * - Either channel → "simulator" when NOTIFICATIONS_SIMULATOR=true and it has
 *   no real provider: marked sent without contacting anyone (demos/tests only).
 * - A channel with no provider is left queued, visible in /admin/notifications.
 */
export type ChannelProvider = "meta" | "resend" | "simulator";
export type DeliveryChannels = { whatsapp: ChannelProvider | null; email: ChannelProvider | null };

function simulatorOn() {
  return process.env.NOTIFICATIONS_SIMULATOR?.trim().toLowerCase() === "true";
}

function metaConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    apiVersion: process.env.WHATSAPP_API_VERSION?.trim() || "v21.0",
    // Template languages approved in WhatsApp Manager, e.g. "en,kn,hi". Others fall back to the first.
    languages: (process.env.WHATSAPP_TEMPLATE_LANGUAGES?.trim() || "en")
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean),
  };
}

function resendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim(); // e.g. "Eventzo <noreply@eventzo.in>"
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export function getDeliveryChannels(): DeliveryChannels {
  return {
    whatsapp: metaConfig() ? "meta" : simulatorOn() ? "simulator" : null,
    email: resendConfig() ? "resend" : simulatorOn() ? "simulator" : null,
  };
}

/**
 * Overall mode for screens: "live" when any real provider is connected,
 * "simulator" when only the simulator is on, null when nothing can send.
 */
export type DeliveryMode = "live" | "simulator";
export function getDeliveryMode(): DeliveryMode | null {
  const c = getDeliveryChannels();
  if (c.whatsapp === "meta" || c.email === "resend") return "live";
  return c.whatsapp || c.email ? "simulator" : null;
}

type OutboxRow = {
  id: string;
  channel: string;
  template: string;
  params: unknown;
  to_address: string;
  locale: string | null;
};

function localeOf(row: OutboxRow): AppLocale {
  return (routing.locales as readonly string[]).includes(row.locale ?? "") ? (row.locale as AppLocale) : "en";
}

function valuesFor(row: OutboxRow, locale: AppLocale) {
  const values = notificationValues(row.params, (p) => formatPaise(p));
  if (/^\d{4}-\d{2}-\d{2}$/.test(values.date))
    values.date = formatDateTime(`${values.date}T00:00:00Z`, locale, "UTC", { dateStyle: "medium" });
  return values;
}

async function sendWhatsapp(row: OutboxRow, kind: NotificationKind): Promise<string> {
  const cfg = metaConfig()!;
  const locale = localeOf(row);
  const language = cfg.languages.includes(locale) ? locale : cfg.languages[0];
  // Meta rejects empty parameters, so a missing value becomes "-".
  const parameters = whatsappVariables(kind, valuesFor(row, locale)).map((text) => ({
    type: "text",
    text: text.trim() || "-",
  }));
  const res = await fetch(`https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: row.to_address.replace(/^\+/, ""),
      type: "template",
      template: {
        name: NOTIFICATION_KINDS[kind].whatsapp.name,
        language: { code: language },
        components: parameters.length ? [{ type: "body", parameters }] : [],
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string; code?: number };
  };
  if (!res.ok || !body.messages?.[0]?.id) {
    throw new Error(
      `WhatsApp ${res.status}: ${body.error?.message ?? "no message id"} (code ${body.error?.code ?? "?"})`,
    );
  }
  return body.messages[0].id;
}

async function sendEmail(row: OutboxRow, kind: NotificationKind): Promise<string> {
  const cfg = resendConfig()!;
  const locale = localeOf(row);
  const t = await getTranslations({ locale, namespace: "notifications" });
  const text = (t as unknown as (key: string, values: Record<string, string>) => string)(
    `kinds.${kind}`,
    valuesFor(row, locale),
  );
  const site = getPublicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const link = `${site}${locale === routing.defaultLocale ? "" : `/${locale}`}/account/notifications`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.from,
      to: [row.to_address],
      subject: `${siteConfig.name}: ${text}`,
      text: `${text}\n\n${link}\n\n— ${siteConfig.name}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !body.id) throw new Error(`Email ${res.status}: ${body.message ?? "no message id"}`);
  return body.id;
}

async function deliver(provider: ChannelProvider, row: OutboxRow): Promise<string> {
  if (!isKnownKind(row.template)) throw new Error(`Unknown template ${row.template}`);
  if (provider === "simulator") {
    // What a provider would receive (template variables in approved order).
    whatsappVariables(row.template, valuesFor(row, localeOf(row)));
    return `sim_${randomBytes(9).toString("hex")}`;
  }
  if (provider === "meta") return sendWhatsapp(row, row.template);
  return sendEmail(row, row.template);
}

/** Claims due outbox rows for channels that have a provider and delivers them. Service role; callers authorise first. */
export async function dispatchOutbox(limit = 50): Promise<{ sent: number; failed: number }> {
  const channels = getDeliveryChannels();
  const active = (Object.keys(channels) as (keyof DeliveryChannels)[]).filter((c) => channels[c]);
  if (active.length === 0) return { sent: 0, failed: 0 };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_outbox", { p_limit: limit, p_channels: active });
  if (error) throw new Error(`claim_outbox failed: ${error.message}`);

  let sent = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const provider = channels[row.channel as keyof DeliveryChannels];
    try {
      if (!provider) throw new Error(`No provider for ${row.channel}`);
      const providerId = await deliver(provider, row);
      await admin.rpc("complete_outbox", {
        p_id: row.id,
        p_success: true,
        p_provider: provider,
        p_provider_message_id: providerId,
        p_error: null as unknown as string,
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      await admin.rpc("complete_outbox", {
        p_id: row.id,
        p_success: false,
        p_provider: provider ?? "none",
        p_provider_message_id: null as unknown as string,
        p_error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { sent, failed };
}
