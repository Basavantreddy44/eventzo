import { z } from "zod";
import { rupeesToPaise } from "@/lib/money";

const rupees = z
  .string()
  .trim()
  .min(1, "validation.required")
  .refine((v) => rupeesToPaise(v) !== null, "validation.amount");

/** Admin form for an estimator price range. Amounts are typed in rupees, stored in paise (D6). */
export const benchmarkFormSchema = z
  .object({
    id: z.uuid().optional(),
    businessCategoryId: z.uuid("validation.select"),
    cityId: z.uuid("validation.select"),
    unit: z.enum(["per_guest", "per_event"], "validation.select"),
    low: rupees,
    high: rupees,
    notes: z.string().trim().max(500, "validation.invalid"),
    source: z.string().trim().max(200, "validation.invalid"),
    isPublished: z.boolean(),
  })
  .refine((v) => (rupeesToPaise(v.high) ?? 0n) >= (rupeesToPaise(v.low) ?? 0n), {
    path: ["high"],
    message: "validation.priceRange",
  });

export type BenchmarkFormInput = z.infer<typeof benchmarkFormSchema>;

/** Converts validated form input into the database row shape. */
export function toBenchmarkRow(input: BenchmarkFormInput) {
  return {
    business_category_id: input.businessCategoryId,
    city_id: input.cityId,
    unit: input.unit,
    low_paise: Number(rupeesToPaise(input.low)),
    high_paise: Number(rupeesToPaise(input.high)),
    notes: input.notes || null,
    source: input.source || null,
    is_published: input.isPublished,
  };
}
