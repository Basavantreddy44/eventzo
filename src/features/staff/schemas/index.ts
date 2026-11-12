import { z } from "zod";
import { rupeesToPaise } from "@/lib/money";
import { normalizePhone } from "@/features/account/schemas";

/**
 * Staff roster, job assignment and staff-app schemas. Messages are i18n keys.
 * Pay is typed in rupees and stored as integer paise (D6).
 */

const MAX_PAY_PAISE = 100_000_000; // ₹10,00,000 a day / job: matches the DB checks

const uuidOrEmpty = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "validation.invalid");
const optionalText = (max: number) => z.string().trim().max(max, "validation.invalid");
const optionalPay = z
  .string()
  .trim()
  .refine((v) => {
    if (v === "") return true;
    const p = rupeesToPaise(v);
    return p !== null && p <= BigInt(MAX_PAY_PAISE);
  }, "validation.amount");

const toPaise = (v: string) => (v ? Number(rupeesToPaise(v)) : null);

// ---------- roster ------------------------------------------------------------------
export const staffSchema = z.object({
  id: z.uuid().optional(),
  fullName: z.string().trim().min(1, "validation.required").max(120, "validation.nameLength"),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || normalizePhone(v) !== null, "validation.phone"),
  skill: optionalText(80),
  branchId: uuidOrEmpty,
  memberId: uuidOrEmpty,
  dayRate: optionalPay,
  notes: optionalText(1000),
});
export type StaffInput = z.infer<typeof staffSchema>;

export function toStaffRow(v: StaffInput) {
  return {
    full_name: v.fullName,
    phone: v.phone ? normalizePhone(v.phone) : null,
    skill: v.skill || null,
    branch_id: v.branchId || null,
    member_id: v.memberId || null,
    day_rate_paise: toPaise(v.dayRate),
    notes: v.notes || null,
  };
}

// ---------- assignments ----------------------------------------------------------------
export const assignSchema = z
  .object({
    jobId: uuidOrEmpty,
    bookingItemId: uuidOrEmpty,
    reservationId: uuidOrEmpty,
    staffProfileId: z.uuid("validation.required"),
    roleLabel: optionalText(80),
    callDate: z.string().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "validation.date"),
    callTime: z.string().refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "validation.time"),
    pay: optionalPay,
  })
  .refine((v) => !!(v.jobId || v.bookingItemId || v.reservationId), {
    message: "validation.invalid",
    path: ["jobId"],
  })
  .refine((v) => (v.callDate === "") === (v.callTime === ""), {
    message: "staff.callTimeBoth",
    path: ["callTime"],
  });
export type AssignInput = z.infer<typeof assignSchema>;

export const assignmentEditSchema = z
  .object({
    assignmentId: z.uuid(),
    roleLabel: optionalText(80),
    callDate: z.string().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "validation.date"),
    callTime: z.string().refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "validation.time"),
    pay: optionalPay,
  })
  .refine((v) => (v.callDate === "") === (v.callTime === ""), {
    message: "staff.callTimeBoth",
    path: ["callTime"],
  });
export type AssignmentEditInput = z.infer<typeof assignmentEditSchema>;

export const payToPaise = toPaise;

export const jobDetailsSchema = z.object({
  jobId: z.uuid(),
  siteAddress: optionalText(500),
  instructions: optionalText(2000),
});
export type JobDetailsInput = z.infer<typeof jobDetailsSchema>;

// ---------- staff app ---------------------------------------------------------------------
export const JOB_ACTIONS = ["accept", "decline", "check_in", "complete"] as const;
export type JobAction = (typeof JOB_ACTIONS)[number];

export const jobResponseSchema = z.object({
  assignmentId: z.uuid(),
  action: z.enum(JOB_ACTIONS),
  note: optionalText(500),
});
export type JobResponseInput = z.infer<typeof jobResponseSchema>;
