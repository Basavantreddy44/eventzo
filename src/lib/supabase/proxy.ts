import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase session for this request.
 *
 * Refreshed cookies are written onto the *request* (so Server Components in
 * this render see the new token) and kept so the caller can copy them onto
 * whatever response it finally sends (next-intl may rewrite or redirect).
 */
export async function refreshSession(request: NextRequest) {
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            pending.push({ name, value, options });
          }
          cacheHeaders = headers ?? {};
        },
      },
    },
  );

  // IMPORTANT: getClaims() validates the JWT and refreshes it when expired.
  // Don't run other logic between creating the client and this call.
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  return {
    userId,
    applyTo(response: NextResponse): NextResponse {
      for (const { name, value, options } of pending) response.cookies.set(name, value, options);
      for (const [key, value] of Object.entries(cacheHeaders)) response.headers.set(key, value);
      return response;
    },
  };
}
