import { z } from "zod";
import { rupeesToPaise } from "@/lib/money";

/** Expense log and staff payout schemas. Amounts are typed in rupees, stored as paise (D6). */

export const EXPENSE_CATEGORIES = [
  "materials",
  "food_supplies",
  "decor_supplies",
  "transport",
  "staff_payout",
  "rent",
  "utilities",
  "equipment",
  "marketing",
  "fees",
  "other",
] as const;
export type ExpenseCategoryInput = (typeof EXPENSE_CATEGORIES)[number];

export const PAYMENT_MODES = ["cash", "upi", "bank_transfer", "cheque"] as const;

const MAX_EXPENSE_PAISE = 10_000_000_000n; // ₹10 crore: matches the DB check

const amount = z
  .string()
  .trim()
  .refine((v) => {
    const p = rupeesToPaise(v);
    return p !== null && p > 0n && p <= MAX_EXPENSE_PAISE;
  }, "validation.amount");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date");
const optionalText = (max: number) => z.string().trim().max(max, "validation.invalid");
const uuidOrEmpty = z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "validation.invalid");

export const expenseSchema = z.object({
  id: z.uuid().optional(),
  category: z.enum(EXPENSE_CATEGORIES, "validation.required"),
  amount,
  spentOn: isoDate,
  payee: optionalText(120),
  mode: z.union([z.literal(""), z.enum(PAYMENT_MODES)]),
  reference: optionalText(200),
  note: optionalText(500),
  branchId: uuidOrEmpty,
  bookingItemId: uuidOrEmpty,
  idempotencyKey: z.string().min(8).max(100),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export function toExpenseRow(v: ExpenseInput) {
  return {
    category: v.category,
    amount_paise: Number(rupeesToPaise(v.amount)),
    spent_on: v.spentOn,
    payee: v.payee || null,
    mode: v.mode || null,
    reference: v.reference || null,
    note: v.note || null,
    branch_id: v.branchId || null,
    booking_item_id: v.bookingItemId || null,
  };
}

export const payoutSchema = z.object({
  assignmentId: z.uuid(),
  amount,
  spentOn: isoDate,
  mode: z.enum(PAYMENT_MODES, "validation.required"),
  reference: optionalText(200),
  idempotencyKey: z.string().min(8).max(100),
});
export type PayoutInput = z.infer<typeof payoutSchema>;
