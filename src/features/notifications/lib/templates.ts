/**
 * Every notification kind the database emits (see the Phase 6 migration
 * triggers), with the WhatsApp template it maps to. WhatsApp business messages
 * must use templates pre-approved by Meta: when a provider is connected, each
 * `whatsapp.name` below is submitted for approval with its variables in this
 * order. Texts for in-app/email live in messages/<locale>.json under
 * notifications.kinds.
 */
export const NOTIFICATION_KINDS = {
  "enquiry.new": { whatsapp: { name: "eventzo_enquiry_new", vars: ["listing", "date"] } },
  "enquiry.declined": { whatsapp: { name: "eventzo_enquiry_declined", vars: ["listing"] } },
  "enquiry.expired": { whatsapp: { name: "eventzo_enquiry_expired", vars: ["listing"] } },
  "enquiry.cancelled": { whatsapp: { name: "eventzo_enquiry_cancelled", vars: ["listing", "date"] } },
  "quote.received": { whatsapp: { name: "eventzo_quote_received", vars: ["vendor", "listing", "amount"] } },
  "quote.accepted": { whatsapp: { name: "eventzo_quote_accepted", vars: ["listing", "date"] } },
  "message.from_customer": { whatsapp: { name: "eventzo_message_customer", vars: ["listing"] } },
  "message.from_vendor": { whatsapp: { name: "eventzo_message_vendor", vars: ["vendor"] } },
  "booking.new": { whatsapp: { name: "eventzo_booking_new", vars: ["listing", "date"] } },
  "booking.confirmed": { whatsapp: { name: "eventzo_booking_confirmed", vars: ["listing", "date"] } },
  "booking.expired": { whatsapp: { name: "eventzo_booking_expired", vars: ["listing", "date"] } },
  "booking.cancelled_by_vendor": { whatsapp: { name: "eventzo_booking_cancelled_vendor", vars: ["vendor", "date"] } },
  "booking.cancelled_by_customer": {
    whatsapp: { name: "eventzo_booking_cancelled_customer", vars: ["listing", "date"] },
  },
  "payment.received": { whatsapp: { name: "eventzo_payment_received", vars: ["amount", "listing"] } },
  "refund.processed": { whatsapp: { name: "eventzo_refund_processed", vars: ["amount", "listing"] } },
  "event.invited": { whatsapp: { name: "eventzo_event_invited", vars: ["by", "event"] } },
  "rsvp.received": { whatsapp: { name: "eventzo_rsvp_received", vars: ["guest", "event"] } },
  "job.assigned": { whatsapp: { name: "eventzo_job_assigned", vars: ["listing", "date"] } },
  "job.cancelled": { whatsapp: { name: "eventzo_job_cancelled", vars: ["listing", "date"] } },
  "job.declined": { whatsapp: { name: "eventzo_job_declined", vars: ["guest", "listing", "date"] } },
  "vendor.suspended": { whatsapp: { name: "eventzo_vendor_suspended", vars: ["vendor", "reason"] } },
  "vendor.closed": { whatsapp: { name: "eventzo_vendor_closed", vars: ["vendor", "reason"] } },
  "vendor.reinstated": { whatsapp: { name: "eventzo_vendor_reinstated", vars: ["vendor"] } },
} as const satisfies Record<string, { whatsapp: { name: string; vars: readonly string[] } }>;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

export const PREFERENCE_CATEGORIES = ["bookings", "payments", "messages", "events"] as const;
export const PREFERENCE_CHANNELS = ["in_app", "whatsapp", "email"] as const;
export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];
export type PreferenceChannel = (typeof PREFERENCE_CHANNELS)[number];

/** Matches private.channel_enabled(): without a saved choice, everything is on except email for chat messages. */
export function defaultChannelEnabled(channel: PreferenceChannel, category: PreferenceCategory): boolean {
  return !(channel === "email" && category === "messages");
}

export function isKnownKind(kind: string): kind is NotificationKind {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_KINDS, kind);
}

const PARAM_KEYS = [
  "listing",
  "vendor",
  "date",
  "amount",
  "version",
  "guest",
  "event",
  "status",
  "count",
  "role",
  "by",
  "reason",
];

/**
 * Turns stored params into message values: every placeholder gets a string
 * (missing → ""), and amount_paise is formatted with the given formatter.
 */
export function notificationValues(params: unknown, formatAmount: (paise: number) => string): Record<string, string> {
  const p = params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>) : {};
  const out: Record<string, string> = Object.fromEntries(PARAM_KEYS.map((k) => [k, ""]));
  for (const k of PARAM_KEYS) {
    const v = p[k];
    if (typeof v === "string" || typeof v === "number") out[k] = String(v);
  }
  if (typeof p.amount_paise === "number" || typeof p.amount_paise === "string") {
    const n = Number(p.amount_paise);
    if (Number.isFinite(n)) out.amount = formatAmount(n);
  }
  return out;
}

/** WhatsApp template variables, in the approved order. */
export function whatsappVariables(kind: NotificationKind, values: Record<string, string>): string[] {
  return NOTIFICATION_KINDS[kind].whatsapp.vars.map((v) => values[v] ?? "");
}

/** Masks a phone or email for operator screens: +91•••••12345, ra•••@example.com. */
export function maskAddress(address: string): string {
  if (address.includes("@")) {
    const [user, domain] = address.split("@");
    return `${user.slice(0, 2)}•••@${domain}`;
  }
  return address.length > 7 ? `${address.slice(0, 3)}•••••${address.slice(-5)}` : "•••";
}
