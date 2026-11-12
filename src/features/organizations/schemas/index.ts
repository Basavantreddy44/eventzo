import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "validation.nameLength").max(120, "validation.nameLength"),
  businessCategoryId: z.uuid("validation.select"),
  cityId: z.uuid("validation.select"),
  idempotencyKey: z.string().min(8).max(100),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const organizationIdSchema = z.uuid();

/** "all" (owners only) or a branch uuid. */
export const branchSelectionSchema = z.union([z.literal("all"), z.uuid()]);
