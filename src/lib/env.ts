import { z } from "zod";

/**
 * Public (browser-safe) environment. `NEXT_PUBLIC_*` values are inlined at
 * build time, so each must be referenced literally (no dynamic access).
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cached: PublicEnv | undefined;

/**
 * The site's own address. When NEXT_PUBLIC_SITE_URL is not set on Vercel, use
 * the project's production domain (a Vercel system variable) rather than
 * localhost, so auth emails, the sitemap and robots.txt never point at
 * localhost (QA B1, B6). Setting NEXT_PUBLIC_SITE_URL still wins, e.g. for a
 * custom domain.
 */
function siteUrl(): string | undefined {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : undefined;
}

export function getPublicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: siteUrl(),
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Invalid or missing environment variables: ${missing}. Copy .env.example to .env.local and fill them in (see README).`,
    );
  }
  cached = parsed.data;
  return cached;
}
