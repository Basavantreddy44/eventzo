import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eventBudget, plannedFromRange } from "@/features/events/lib/budget";
import { guestSummary, inviteUrl, whatsappShareUrl } from "@/features/events/lib/guests";
import {
  budgetLineSchema,
  createEventSchema,
  daysBetween,
  eventDetailsSchema,
  guestSchema,
  hostRsvpSchema,
  inviteMemberSchema,
  parseGuestLines,
  rsvpSchema,
} from "@/features/events/schemas";
import {
  defaultChannelEnabled,
  isKnownKind,
  maskAddress,
  NOTIFICATION_KINDS,
  notificationValues,
  whatsappVariables,
} from "@/features/notifications/lib/templates";
import en from "../../messages/en.json";

const UUID = "0b6c1c38-4a3e-4c55-9d43-5d0d7b7d3a11";
const CAT_A = "11111111-1111-4111-8111-111111111111";
const CAT_B = "22222222-2222-4222-8222-222222222222";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012-_9";

describe("bulk guest list parsing", () => {
  it("reads name, Indian mobile and party size in any order", () => {
    const { guests, invalidLines } = parseGuestLines(
      "Kamala Patil, 98450 12345, 2\nSuresh Kulkarni\t3\n\n  Anita; +91 98450 54321  \nRavi, 4, 09845011111",
    );
    expect(invalidLines).toEqual([]);
    expect(guests).toEqual([
      { name: "Kamala Patil", phone: "+919845012345", partySize: 2 },
      { name: "Suresh Kulkarni", phone: null, partySize: 3 },
      { name: "Anita", phone: "+919845054321", partySize: 1 },
      { name: "Ravi", phone: "+919845011111", partySize: 4 },
    ]);
  });

  it("reports unreadable lines by number (1-based, blank lines counted)", () => {
    const { guests, invalidLines } = parseGuestLines("Good, 2\n\nBad, not-a-phone\n, 98450 12345\nToo many, 99");
    expect(guests).toHaveLength(1);
    expect(invalidLines).toEqual([3, 4, 5]);
  });

  it("rejects a second phone number on one line", () => {
    expect(parseGuestLines("Two phones, 9845012345, 9845054321").invalidLines).toEqual([1]);
  });
});

describe("event budget (planned vs booked vs paid)", () => {
  const lines = [
    { id: "l1", business_category_id: CAT_A, label: null, planned_paise: 50_000_000 },
    { id: "l2", business_category_id: null, label: "Jewellery", planned_paise: 20_000_000 },
  ];
  const vendors = [
    {
      business_category_id: CAT_A,
      booking_status: "confirmed",
      total_paise: 40_000_000,
      paid_paise: 10_000_000,
      refunded_paise: 0,
    },
    // cancelled: no longer booked, but money kept after the refund still counts as paid
    {
      business_category_id: CAT_A,
      booking_status: "cancelled",
      total_paise: 8_000_000,
      paid_paise: 2_000_000,
      refunded_paise: 1_000_000,
    },
    // a category with a booking but no planned line gets its own row
    {
      business_category_id: CAT_B,
      booking_status: "pending_payment",
      total_paise: 30_000_000,
      paid_paise: 0,
      refunded_paise: 0,
    },
    // enquiry without a booking: ignored
    { business_category_id: CAT_B, booking_status: null, total_paise: null, paid_paise: null, refunded_paise: null },
  ];

  it("adds up per category and in total", () => {
    const b = eventBudget(lines, vendors);
    const byKey = Object.fromEntries(b.rows.map((r) => [r.key, r]));
    expect(byKey[CAT_A]).toMatchObject({ plannedPaise: 50_000_000, bookedPaise: 40_000_000, paidPaise: 11_000_000 });
    expect(byKey["label:l2"]).toMatchObject({ label: "Jewellery", plannedPaise: 20_000_000, bookedPaise: 0 });
    expect(byKey[CAT_B]).toMatchObject({ lineId: null, plannedPaise: 0, bookedPaise: 30_000_000 });
    expect(b).toMatchObject({
      plannedPaise: 70_000_000,
      bookedPaise: 70_000_000,
      paidPaise: 11_000_000,
      remainingPaise: 0,
    });
  });

  it("shows overspend as a negative remainder", () => {
    expect(eventBudget([lines[0]], [vendors[0], vendors[2]]).remainingPaise).toBe(-20_000_000);
  });

  it("an empty event has an empty budget", () => {
    expect(eventBudget([], [])).toEqual({ rows: [], plannedPaise: 0, bookedPaise: 0, paidPaise: 0, remainingPaise: 0 });
  });

  it("estimator midpoint is rounded to whole rupees", () => {
    expect(plannedFromRange(30_000_000, 50_000_000)).toBe(40_000_000);
    expect(plannedFromRange(101, 250)).toBe(200);
  });
});

describe("guest summary and invitation links", () => {
  it("counts people, not just invitations", () => {
    const s = guestSummary([
      { party_size: 4, rsvp_status: "attending", attending_count: 3, invited_at: "2026-11-12T10:00:00Z" },
      { party_size: 2, rsvp_status: "maybe", attending_count: 2, invited_at: null },
      { party_size: 1, rsvp_status: "declined", attending_count: 0, invited_at: "2026-11-12T10:00:00Z" },
      { party_size: 5, rsvp_status: "pending", attending_count: 0, invited_at: null },
    ]);
    expect(s).toEqual({
      guests: 4,
      invitedPeople: 12,
      linksShared: 2,
      attendingPeople: 3,
      maybePeople: 2,
      declined: 1,
      pending: 1,
    });
  });

  it("builds locale-aware RSVP links", () => {
    expect(inviteUrl("https://eventzo.in/", "en", TOKEN)).toBe(`https://eventzo.in/invite/${TOKEN}`);
    expect(inviteUrl("https://eventzo.in", "kn", TOKEN)).toBe(`https://eventzo.in/kn/invite/${TOKEN}`);
  });

  it("builds wa.me links with or without a phone", () => {
    expect(whatsappShareUrl("+919845012345", "Hi & welcome")).toBe(
      "https://wa.me/919845012345?text=Hi%20%26%20welcome",
    );
    expect(whatsappShareUrl(null, "x")).toBe("https://wa.me/?text=x");
  });
});

describe("event schemas", () => {
  const event = {
    title: "Meera weds Arjun",
    eventType: "wedding" as const,
    cityId: "",
    startDate: "2027-02-10",
    endDate: "",
    guestEstimate: "400",
    idempotencyKey: "abcdef12-key",
  };

  it("accepts a one-day event and a short multi-day event", () => {
    expect(createEventSchema.safeParse(event).success).toBe(true);
    expect(createEventSchema.safeParse({ ...event, endDate: "2027-02-12", cityId: UUID }).success).toBe(true);
  });

  it.each([
    [{ title: "A" }, "title"],
    [{ eventType: "funeral" }, "eventType"],
    [{ startDate: "10/02/2027" }, "startDate"],
    [{ endDate: "2027-02-09" }, "endDate"],
    [{ endDate: "2027-03-20" }, "endDate"],
    [{ guestEstimate: "0" }, "guestEstimate"],
    [{ guestEstimate: "lots" }, "guestEstimate"],
  ])("rejects %o", (patch, field) => {
    const r = createEventSchema.safeParse({ ...event, ...patch });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path[0]).toBe(field);
  });

  it("limits invitation texts", () => {
    const base = { ...event, eventId: UUID, hostsText: "", venueText: "", invitationMessage: "" };
    expect(eventDetailsSchema.safeParse(base).success).toBe(true);
    expect(eventDetailsSchema.safeParse({ ...base, invitationMessage: "x".repeat(1001) }).success).toBe(false);
  });

  it("daysBetween counts calendar days", () => {
    expect(daysBetween("2027-02-10", "2027-03-12")).toBe(30);
  });

  it("invites only as co-host or viewer, with a valid email", () => {
    expect(
      inviteMemberSchema.safeParse({ eventId: UUID, email: " Ravi@Example.com ", role: "cohost" }).data?.email,
    ).toBe("ravi@example.com");
    expect(inviteMemberSchema.safeParse({ eventId: UUID, email: "ravi@example.com", role: "owner" }).success).toBe(
      false,
    );
    expect(inviteMemberSchema.safeParse({ eventId: UUID, email: "nope", role: "viewer" }).success).toBe(false);
  });

  it("validates guests", () => {
    const g = { eventId: UUID, name: "Kamala", phone: "", email: "", groupLabel: "", partySize: "2" };
    expect(guestSchema.safeParse(g).success).toBe(true);
    expect(guestSchema.safeParse({ ...g, phone: "98450 12345" }).success).toBe(true);
    expect(guestSchema.safeParse({ ...g, phone: "12345" }).success).toBe(false);
    expect(guestSchema.safeParse({ ...g, partySize: "0" }).success).toBe(false);
    expect(guestSchema.safeParse({ ...g, partySize: "51" }).success).toBe(false);
    expect(guestSchema.safeParse({ ...g, name: " " }).success).toBe(false);
  });

  it("RSVP headcount must fit the reply", () => {
    const r = { token: TOKEN, status: "attending" as const, count: 2, note: "" };
    expect(rsvpSchema.safeParse(r).success).toBe(true);
    expect(rsvpSchema.safeParse({ ...r, count: 0 }).success).toBe(false);
    expect(rsvpSchema.safeParse({ ...r, status: "declined", count: 0 }).success).toBe(true);
    expect(rsvpSchema.safeParse({ ...r, token: "short" }).success).toBe(false);
    expect(rsvpSchema.safeParse({ ...r, status: "pending" }).success).toBe(false);
    expect(hostRsvpSchema.safeParse({ guestId: UUID, status: "declined", count: 2 }).success).toBe(false);
    expect(hostRsvpSchema.safeParse({ guestId: UUID, status: "pending", count: 0 }).success).toBe(true);
  });

  it("a budget line is a category or a named line, never both", () => {
    const l = { eventId: UUID, categoryId: UUID, label: "", planned: "1,50,000" };
    expect(budgetLineSchema.safeParse(l).success).toBe(true);
    expect(budgetLineSchema.safeParse({ ...l, categoryId: "", label: "Jewellery" }).success).toBe(true);
    expect(budgetLineSchema.safeParse({ ...l, label: "Jewellery" }).success).toBe(false);
    expect(budgetLineSchema.safeParse({ ...l, categoryId: "" }).success).toBe(false);
    expect(budgetLineSchema.safeParse({ ...l, planned: "-5" }).success).toBe(false);
  });
});

describe("notification templates", () => {
  it("every kind has English text and a WhatsApp template name", () => {
    const kinds = (en as { notifications: { kinds: Record<string, Record<string, string>> } }).notifications.kinds;
    for (const kind of Object.keys(NOTIFICATION_KINDS)) {
      const [group, name] = kind.split(".");
      expect(kinds[group]?.[name], kind).toBeTypeOf("string");
      expect(NOTIFICATION_KINDS[kind as keyof typeof NOTIFICATION_KINDS].whatsapp.name).toMatch(/^eventzo_[a-z_]+$/);
    }
  });

  it("covers every kind the database emits", () => {
    const sql = readFileSync("supabase/migrations/20261115000100_events_notifications.sql", "utf8");
    const emitted = new Set(
      [...sql.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]).filter((k) => !k.includes("_.")),
    );
    const kinds = [...emitted].filter((k) => /^(enquiry|quote|message|booking|payment|refund|event|rsvp)\./.test(k));
    expect(kinds.length).toBeGreaterThan(10);
    for (const k of kinds) expect(isKnownKind(k), k).toBe(true);
  });

  it("fills every placeholder and formats amounts", () => {
    const v = notificationValues(
      { listing: "Tau Hall", amount_paise: 2500000, count: 3, junk: { x: 1 } },
      (p) => `₹${p / 100}`,
    );
    expect(v).toMatchObject({ listing: "Tau Hall", amount: "₹25000", count: "3", vendor: "", date: "" });
    expect(notificationValues(null, String).listing).toBe("");
    expect(whatsappVariables("quote.received", { vendor: "Tau", listing: "Hall", amount: "₹1" })).toEqual([
      "Tau",
      "Hall",
      "₹1",
    ]);
  });

  it("defaults: everything on except email for chat messages", () => {
    expect(defaultChannelEnabled("whatsapp", "bookings")).toBe(true);
    expect(defaultChannelEnabled("email", "messages")).toBe(false);
    expect(defaultChannelEnabled("in_app", "messages")).toBe(true);
  });

  it("masks addresses on operator screens", () => {
    expect(maskAddress("+919845012345")).toBe("+91•••••12345");
    expect(maskAddress("ravi@example.com")).toBe("ra•••@example.com");
  });
});

describe("notification delivery mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is off unless NOTIFICATIONS_SIMULATOR=true", async () => {
    vi.doMock("server-only", () => ({}));
    vi.stubEnv("NOTIFICATIONS_SIMULATOR", "");
    const { getDeliveryMode } = await import("@/features/notifications/lib/delivery");
    expect(getDeliveryMode()).toBeNull();
    vi.stubEnv("NOTIFICATIONS_SIMULATOR", " TRUE ");
    expect(getDeliveryMode()).toBe("simulator");
  });
});
