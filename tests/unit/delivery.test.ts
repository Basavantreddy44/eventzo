import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Roadmap A3/A4: the outbox sends WhatsApp through Meta Cloud API and email
 * through Resend, each only when configured. fetch and Supabase are mocked,
 * so nothing is sent.
 */

const rpc = vi.fn();

async function load(env: Record<string, string>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const k of [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_TEMPLATE_LANGUAGES",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "NOTIFICATIONS_SIMULATOR",
  ])
    vi.stubEnv(k, "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "x".repeat(40));
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://eventzo.example");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.doMock("server-only", () => ({}));
  vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
  vi.doMock("next-intl/server", () => ({
    getTranslations: async () => (key: string, v: Record<string, string>) => `${key} ${v.listing}`,
  }));
  return import("@/features/notifications/lib/delivery");
}

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "row-1",
  channel: "whatsapp",
  template: "enquiry.new",
  params: { listing: "Lakshmi Hall", date: "2026-12-22" },
  to_address: "+919845012345",
  locale: "kn",
  ...over,
});

beforeEach(() => {
  rpc.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("delivery channels", () => {
  it("nothing is sendable without providers", async () => {
    const d = await load({});
    expect(d.getDeliveryChannels()).toEqual({ whatsapp: null, email: null });
    expect(d.getDeliveryMode()).toBeNull();
    expect(await d.dispatchOutbox()).toEqual({ sent: 0, failed: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("real providers win over the simulator, per channel", async () => {
    const d = await load({
      WHATSAPP_ACCESS_TOKEN: "t",
      WHATSAPP_PHONE_NUMBER_ID: "123",
      NOTIFICATIONS_SIMULATOR: "true",
    });
    expect(d.getDeliveryChannels()).toEqual({ whatsapp: "meta", email: "simulator" });
    expect(d.getDeliveryMode()).toBe("live");
  });
});

describe("WhatsApp via Meta Cloud API", () => {
  it("sends the approved template with variables in order, in the recipient's language when approved", async () => {
    const d = await load({
      WHATSAPP_ACCESS_TOKEN: "token-1",
      WHATSAPP_PHONE_NUMBER_ID: "555",
      WHATSAPP_TEMPLATE_LANGUAGES: "en,kn",
    });
    rpc.mockImplementation(async (fn: string) =>
      fn === "claim_outbox" ? { data: [row()], error: null } : { error: null },
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }),
    );

    expect(await d.dispatchOutbox()).toEqual({ sent: 1, failed: 0 });
    expect(rpc).toHaveBeenCalledWith("claim_outbox", { p_limit: 50, p_channels: ["whatsapp"] });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/555/messages");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-1" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe("919845012345");
    expect(body.template.name).toBe("eventzo_enquiry_new");
    expect(body.template.language.code).toBe("kn");
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([
      "Lakshmi Hall",
      expect.stringContaining("2026"),
    ]);
    expect(rpc).toHaveBeenCalledWith(
      "complete_outbox",
      expect.objectContaining({ p_success: true, p_provider: "meta", p_provider_message_id: "wamid.1" }),
    );
  });

  it("falls back to the first approved language and records Meta's error for a retry", async () => {
    const d = await load({ WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "555" });
    rpc.mockImplementation(async (fn: string) =>
      fn === "claim_outbox" ? { data: [row({ locale: "hi" })], error: null } : { error: null },
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Template name does not exist", code: 132001 } }), {
        status: 404,
      }),
    );
    expect(await d.dispatchOutbox()).toEqual({ sent: 0, failed: 1 });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.template.language.code).toBe("en");
    expect(rpc).toHaveBeenCalledWith(
      "complete_outbox",
      expect.objectContaining({ p_success: false, p_error: expect.stringContaining("Template name does not exist") }),
    );
  });
});

describe("email via Resend", () => {
  it("sends a plain email with a link back to the app", async () => {
    const d = await load({ RESEND_API_KEY: "re_1", EMAIL_FROM: "Eventzo <noreply@eventzo.example>" });
    rpc.mockImplementation(async (fn: string) =>
      fn === "claim_outbox"
        ? { data: [row({ channel: "email", to_address: "asha@example.test", locale: "en" })], error: null }
        : { error: null },
    );
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    expect(await d.dispatchOutbox()).toEqual({ sent: 1, failed: 0 });
    expect(rpc).toHaveBeenCalledWith("claim_outbox", { p_limit: 50, p_channels: ["email"] });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toEqual(["asha@example.test"]);
    expect(body.from).toBe("Eventzo <noreply@eventzo.example>");
    expect(body.subject).toContain("Lakshmi Hall");
    expect(body.text).toContain("https://eventzo.example/account/notifications");
  });
});
