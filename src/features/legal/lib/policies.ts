import type { Database } from "@/types/database";

export type PolicyType = Database["public"]["Enums"]["policy_type"];

/** Public URL slug ↔ policy type. Pages live at /legal/<slug>. */
export const LEGAL_PAGES = {
  terms: "terms_of_service",
  privacy: "privacy_policy",
  refunds: "refund_policy",
  "vendor-agreement": "vendor_agreement",
} as const satisfies Record<string, PolicyType>;

export type LegalSlug = keyof typeof LEGAL_PAGES;

export function isLegalSlug(value: string): value is LegalSlug {
  return Object.prototype.hasOwnProperty.call(LEGAL_PAGES, value);
}

/** Versions below 1.0 are drafts awaiting legal review (Roadmap A8). */
export function isDraftVersion(version: string): boolean {
  const major = Number(version.split(".")[0]);
  return !Number.isFinite(major) || major < 1;
}
