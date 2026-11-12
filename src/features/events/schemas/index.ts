import { z } from "zod";
import { emailSchema } from "@/features/auth/schemas";
import { normalizePhone } from "@/features/account/schemas";
import { rupeesToPaise } from "@/lib/money";

export const EVENT_TYPES = [
  "wedding",
  "engagement",
  "reception",
  "haldi_mehendi",
  "birthday",
  "naming_ceremony",
  "housewarming",
  "anniversary",
  "corporate",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TABS = ["overview", "guests", "budget", "people"] as const;
export type EventTab = (typeof EVENT_TABS)[number];

export const RSVP_CHOICES = ["attending", "maybe", "declined"] as const;
export const MAX_PARTY_SIZE = 50;
export const MAX_BULK_GUESTS = 200;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const uuid = z.uuid("validation.invalid");
const optionalUuid = z.union([z.literal(""), uuid]);
const isoDate = z.string().regex(DATE, "validation.date");
const optionalText = (max: number, key = "validation.tooLong") => z.string().trim().max(max, key);
const guests = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d{1,6}$/.test(v) && Number(v) >= 1 && Number(v) <= 100_000), "validation.guests");
const phone = z
  .string()
  .trim()
  .refine((v) => v === "" || normalizePhone(v) !== null, "validation.phone");

const dates = <T extends { startDate: string; endDate: string }>(v: T) =>
  v.endDate === "" || (v.endDate >= v.startDate && daysBetween(v.startDate, v.endDate) <= 30);

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export const createEventSchema = z
  .object({
    title: z.string().trim().min(2, "validation.eventTitle").max(120, "validation.eventTitle"),
    eventType: z.enum(EVENT_TYPES, "validation.required"),
    cityId: optionalUuid,
    startDate: isoDate,
    endDate: z.union([z.literal(""), isoDate]),
    guestEstimate: guests,
    idempotencyKey: z.string().min(8).max(100),
  })
  .refine(dates, { path: ["endDate"], message: "validation.eventDates" });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const eventDetailsSchema = z
  .object({
    eventId: uuid,
    title: z.string().trim().min(2, "validation.eventTitle").max(120, "validation.eventTitle"),
    eventType: z.enum(EVENT_TYPES, "validation.required"),
    cityId: optionalUuid,
    startDate: isoDate,
    endDate: z.union([z.literal(""), isoDate]),
    guestEstimate: guests,
    hostsText: optionalText(200),
    venueText: optionalText(300),
    invitationMessage: optionalText(1000),
  })
  .refine(dates, { path: ["endDate"], message: "validation.eventDates" });
export type EventDetailsInput = z.infer<typeof eventDetailsSchema>;

export const inviteMemberSchema = z.object({
  eventId: uuid,
  email: emailSchema,
  role: z.enum(["cohost", "viewer"]),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const guestSchema = z.object({
  eventId: uuid,
  name: z.string().trim().min(1, "validation.required").max(120, "validation.tooLong"),
  phone,
  email: z.union([z.literal(""), emailSchema]),
  groupLabel: optionalText(60),
  partySize: z
    .string()
    .trim()
    .refine((v) => /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= MAX_PARTY_SIZE, "validation.partySize"),
});
export type GuestInput = z.infer<typeof guestSchema>;

export const hostRsvpSchema = z
  .object({
    guestId: uuid,
    status: z.enum(["pending", ...RSVP_CHOICES]),
    count: z.number().int().min(0).max(MAX_PARTY_SIZE),
  })
  .refine((v) => (v.status === "attending" ? v.count >= 1 : v.status === "maybe" ? true : v.count === 0), {
    path: ["count"],
    message: "validation.rsvpCount",
  });
export type HostRsvpInput = z.infer<typeof hostRsvpSchema>;

export const rsvpSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{32}$/, "validation.invalid"),
    status: z.enum(RSVP_CHOICES, "validation.required"),
    count: z.number().int().min(0).max(MAX_PARTY_SIZE),
    note: optionalText(500),
  })
  .refine((v) => v.status !== "attending" || v.count >= 1, { path: ["count"], message: "validation.rsvpCount" });
export type RsvpInput = z.infer<typeof rsvpSchema>;

const plannedRupees = z
  .string()
  .trim()
  .refine((v) => {
    const p = rupeesToPaise(v);
    return p !== null && p <= 100_000_000_000n;
  }, "validation.amount");

export const budgetLineSchema = z
  .object({
    eventId: uuid,
    categoryId: optionalUuid,
    label: optionalText(80),
    planned: plannedRupees,
  })
  .refine((v) => (v.categoryId === "") !== (v.label === ""), { path: ["label"], message: "validation.budgetLine" });
export type BudgetLineInput = z.infer<typeof budgetLineSchema>;

export const budgetPlannedSchema = z.object({ lineId: uuid, planned: plannedRupees });
export type BudgetPlannedInput = z.infer<typeof budgetPlannedSchema>;

export type ParsedGuest = { name: string; phone: string | null; partySize: number };

/**
 * Bulk paste, one guest per line: "Name, phone, party size" (phone and size
 * optional; commas, tabs or semicolons). Returns the guests and the 1-based
 * line numbers that couldn't be read.
 */
export function parseGuestLines(text: string): { guests: ParsedGuest[]; invalidLines: number[] } {
  const guestsOut: ParsedGuest[] = [];
  const invalidLines: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[,\t;]/).map((p) => p.trim());
    const name = parts[0] ?? "";
    let phoneOut: string | null = null;
    let size = 1;
    let valid = name.length >= 1 && name.length <= 120;
    for (const part of parts.slice(1)) {
      if (!part) continue;
      if (/^\d{1,2}$/.test(part) && Number(part) >= 1 && Number(part) <= MAX_PARTY_SIZE) size = Number(part);
      else {
        const p = normalizePhone(part);
        if (p && !phoneOut) phoneOut = p;
        else valid = false;
      }
    }
    if (valid) guestsOut.push({ name, phone: phoneOut, partySize: size });
    else invalidLines.push(i + 1);
  });
  return { guests: guestsOut, invalidLines };
}
