import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { paymentSteps } from "@/features/bookings/lib/timeline";
import { eventBudget, overPlanAfter } from "@/features/events/lib/budget";
import { localeShort, routing } from "@/i18n/routing";
import { TEXT_SIZE_KEY, TEXT_SIZE_SCRIPT } from "@/lib/text-size";
import { canReview, moderateSchema, photoExtension, replySchema, reviewSchema } from "@/features/reviews/schemas";
import {
  isOverdue,
  openTicketSchema,
  slaHours,
  supportMessageSchema,
  SUPPORT_TOPICS,
} from "@/features/support/schemas";
import { isKnownKind, NOTIFICATION_KINDS, notificationValues } from "@/features/notifications/lib/templates";

const ITEM = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PHOTO = `${USER}/33333333-3333-4333-8333-333333333333.jpg`;

describe("C7 reviews", () => {
  it("only past, confirmed bookings can be reviewed", () => {
    expect(canReview({ status: "confirmed", event_date: "2026-11-10" }, "2026-11-16")).toBe(true);
    expect(canReview({ status: "confirmed", event_date: "2026-11-16" }, "2026-11-16")).toBe(false);
    expect(canReview({ status: "cancelled", event_date: "2026-11-01" }, "2026-11-16")).toBe(false);
    expect(canReview({ status: "pending_payment", event_date: "2026-11-01" }, "2026-11-16")).toBe(false);
  });

  it("validates rating, text and photos", () => {
    const ok = { itemId: ITEM, rating: 5, body: "Lovely hall and staff", photos: [PHOTO] };
    expect(reviewSchema.safeParse(ok).success).toBe(true);
    expect(reviewSchema.safeParse({ ...ok, rating: 0 }).error?.issues[0].message).toBe("reviews.ratingRequired");
    expect(reviewSchema.safeParse({ ...ok, rating: 6 }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...ok, body: "  short  " }).error?.issues[0].message).toBe("reviews.bodyTooShort");
    expect(reviewSchema.safeParse({ ...ok, photos: Array(5).fill(PHOTO) }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...ok, photos: ["../etc/passwd.jpg"] }).success).toBe(false);
  });

  it("needs a reason to hide, not to restore", () => {
    expect(moderateSchema.safeParse({ reviewId: ITEM, status: "hidden" }).success).toBe(false);
    expect(moderateSchema.safeParse({ reviewId: ITEM, status: "hidden", reason: "Phone number in text" }).success).toBe(
      true,
    );
    expect(moderateSchema.safeParse({ reviewId: ITEM, status: "published" }).success).toBe(true);
    expect(replySchema.safeParse({ reviewId: ITEM, reply: "   " }).success).toBe(false);
  });

  it("maps photo types to extensions", () => {
    expect(photoExtension("image/jpeg")).toBe("jpg");
    expect(photoExtension("image/webp")).toBe("webp");
    expect(photoExtension("image/gif")).toBeNull();
  });
});

describe("C10/S2 support", () => {
  it("mirrors the database reply targets", () => {
    expect(slaHours("problem")).toBe(4);
    expect(slaHours("vendor_not_responding")).toBe(4);
    expect(slaHours("change_date")).toBe(24);
    expect(slaHours("other")).toBe(24);
  });

  it("validates a help request", () => {
    const ok = { itemId: ITEM, topic: "problem", body: "Decorator did not arrive", idempotencyKey: "abcdefgh-1234" };
    expect(openTicketSchema.safeParse(ok).success).toBe(true);
    expect(openTicketSchema.safeParse({ ...ok, itemId: null }).success).toBe(true);
    expect(openTicketSchema.safeParse({ ...ok, topic: "refund_now" }).error?.issues[0].message).toBe(
      "support.topicRequired",
    );
    expect(openTicketSchema.safeParse({ ...ok, body: "help" }).error?.issues[0].message).toBe("support.bodyTooShort");
    expect(supportMessageSchema.parse({ ticketId: ITEM, body: "Thanks" }).internal).toBe(false);
  });

  it("flags requests past their reply target that nobody answered", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    const base = { status: "open", sla_due_at: "2026-11-16T10:00:00Z", first_response_at: null };
    expect(isOverdue(base, now)).toBe(true);
    expect(isOverdue({ ...base, first_response_at: "2026-11-16T09:00:00Z" }, now)).toBe(false);
    expect(isOverdue({ ...base, status: "resolved" }, now)).toBe(false);
    expect(isOverdue({ ...base, sla_due_at: "2026-11-16T13:00:00Z" }, now)).toBe(false);
  });

  it("has a label for every topic", () => {
    for (const topic of SUPPORT_TOPICS) expect(en.support.topics[topic]).toBeTruthy();
  });
});

describe("C8 payment timeline", () => {
  const item = {
    status: "confirmed",
    total_paise: 10_000_000,
    advance_paise: 2_500_000,
    paid_paise: 2_500_000,
    balance_due_on: "2026-12-10",
    event_date: "2026-12-13",
  };

  it("advance paid → balance due", () => {
    const steps = paymentSteps(item, "2026-11-16");
    expect(steps.map((s) => [s.key, s.state])).toEqual([
      ["booked", "done"],
      ["advance", "done"],
      ["balance", "due"],
      ["event", "upcoming"],
    ]);
    expect(steps[2].amount).toBe(7_500_000);
  });

  it("balance past its date is overdue; fully paid is done", () => {
    expect(paymentSteps(item, "2026-12-11")[2].state).toBe("overdue");
    expect(paymentSteps({ ...item, paid_paise: 10_000_000 }, "2026-12-11")[2].state).toBe("done");
  });

  it("waiting for the advance", () => {
    const steps = paymentSteps({ ...item, status: "pending_payment", paid_paise: 0 }, "2026-11-16");
    expect(steps[1].state).toBe("due");
    expect(steps[2].state).toBe("upcoming");
  });

  it("no balance step when the advance is the full amount", () => {
    expect(paymentSteps({ ...item, advance_paise: 10_000_000 }, "2026-11-16").map((s) => s.key)).toEqual([
      "booked",
      "advance",
      "event",
    ]);
  });
});

describe("batch 3a notifications", () => {
  const kinds = [
    "payment.reminder",
    "review.request",
    "review.new",
    "review.replied",
    "support.replied",
    "support.resolved",
  ];

  it("are known, with WhatsApp templates and English text", () => {
    for (const k of kinds) {
      expect(isKnownKind(k)).toBe(true);
      const [group, name] = k.split(".");
      expect((en.notifications.kinds as Record<string, Record<string, string>>)[group][name]).toBeTruthy();
    }
    expect(NOTIFICATION_KINDS["support.replied"].whatsapp.vars).toEqual(["ref"]);
  });

  it("pass the request number and rating through", () => {
    const v = notificationValues({ ref: 1001, rating: 5 }, String);
    expect(v.ref).toBe("1001");
    expect(v.rating).toBe("5");
  });
});

describe("C13 budget from guests", () => {
  const summary = eventBudget(
    [{ id: "l1", business_category_id: "cat-decor", label: null, planned_paise: 20_000_000 }],
    [
      {
        business_category_id: "cat-decor",
        booking_status: "confirmed",
        total_paise: 15_000_000,
        paid_paise: 0,
        refunded_paise: 0,
      },
    ],
  );

  it("warns when a booking would pass the category's plan", () => {
    expect(overPlanAfter(summary, "cat-decor", 8_000_000)).toEqual({
      plannedPaise: 20_000_000,
      afterPaise: 23_000_000,
      overPaise: 3_000_000,
    });
  });

  it("stays quiet when it fits, or when there is no plan for the category", () => {
    expect(overPlanAfter(summary, "cat-decor", 5_000_000)).toBeNull();
    expect(overPlanAfter(summary, "cat-catering", 99_000_000)).toBeNull();
    expect(overPlanAfter(summary, null, 1)).toBeNull();
  });
});

describe("C12 language and large text", () => {
  it("every language has a short label for the header", () => {
    expect(Object.keys(localeShort).sort()).toEqual([...routing.locales].sort());
  });

  it("the head script only reads the saved choice", () => {
    expect(TEXT_SIZE_SCRIPT).toContain(`localStorage.getItem("${TEXT_SIZE_KEY}")`);
    expect(TEXT_SIZE_SCRIPT).toMatch(/^try\{/);
  });
});
