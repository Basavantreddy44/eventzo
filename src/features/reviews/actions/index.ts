"use server";

import { updateTag } from "next/cache";
import { fail, mapDbError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { REVIEWS_TAG } from "../queries";
import {
  moderateSchema,
  replySchema,
  reviewSchema,
  type ModerateInput,
  type ReplyInput,
  type ReviewInput,
} from "../schemas";

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  return Object.fromEntries(issues.map((i) => [String(i.path[0] ?? "form"), i.message]));
}

/** C7: the customer reviews a past, confirmed booking (the database enforces who and when). */
export async function submitReview(input: ReviewInput): Promise<ActionResult<string>> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", fieldErrors(parsed.error.issues));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_review", {
    p_booking_item_id: parsed.data.itemId,
    p_rating: parsed.data.rating,
    p_body: parsed.data.body,
    p_photos: parsed.data.photos,
  });
  if (error) return fail(error.code === "22023" ? "reviews.cannotReview" : `errors.${mapDbError(error)}`);
  updateTag(REVIEWS_TAG);
  return ok(data as string);
}

export async function replyToReview(input: ReplyInput): Promise<ActionResult> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", fieldErrors(parsed.error.issues));
  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_review", {
    p_review_id: parsed.data.reviewId,
    p_reply: parsed.data.reply,
  });
  if (error) return fail(`errors.${mapDbError(error)}`);
  updateTag(REVIEWS_TAG);
  return ok(undefined);
}

export async function moderateReview(input: ModerateInput): Promise<ActionResult> {
  const parsed = moderateSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput", fieldErrors(parsed.error.issues));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_review_status", {
    p_review_id: parsed.data.reviewId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? undefined,
  });
  if (error) return fail(`errors.${mapDbError(error)}`);
  updateTag(REVIEWS_TAG);
  return ok(undefined);
}
