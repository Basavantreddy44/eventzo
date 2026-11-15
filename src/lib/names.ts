import { z } from "zod";

/**
 * Tidies a person's name as typed: trims, collapses runs of whitespace and
 * drops stray separators at either end ("QA Retest Customer," → "QA Retest
 * Customer"; QA B13). Inner punctuation such as "S. Rao" is kept.
 */
export function cleanPersonName(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[\s,;:]+|[\s,;:]+$/g, "");
}

/** Zod field for a person's name; validates length after tidying. */
export function personNameSchema(min: number, minMessage = "validation.nameLength") {
  return z.string().transform(cleanPersonName).pipe(z.string().min(min, minMessage).max(120, "validation.nameLength"));
}
