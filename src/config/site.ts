/** Brand and app-wide constants. Change the brand name here only. */
export const siteConfig = {
  name: "Eventzo",
  /** Translated tagline lives in messages under `brand.tagline`. */
  defaultTimeZone: "Asia/Kolkata",
  defaultCurrency: "INR",
} as const;

/** Cookie names used by the app (not Supabase auth cookies). */
export const appCookies = {
  activeOrganization: "ez_active_org",
  activeBranch: "ez_active_branch",
} as const;
