import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { refreshSession } from "@/lib/supabase/proxy";
import { isProtectedPath, stripLocale } from "@/lib/auth/paths";

const intl = createIntlMiddleware(routing);

/**
 * 1. Refresh the Supabase session (every request).
 * 2. Apply locale routing (next-intl), except for non-localised route handlers.
 * 3. Coarse gate: signed-out users can't open /account, /vendor or /admin.
 *    Real authorisation (roles, membership) happens server-side in each
 *    layout/page/action and in RLS. This gate is only for UX.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await refreshSession(request);

  // Auth callbacks and API route handlers are not localised.
  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/")) {
    return session.applyTo(NextResponse.next({ request }));
  }

  const { locale, path } = stripLocale(pathname);
  if (!session.userId && isProtectedPath(path)) {
    const loginPath = locale === routing.defaultLocale ? "/login" : `/${locale}/login`;
    const url = new URL(loginPath, request.url);
    url.searchParams.set("next", pathname + search);
    return session.applyTo(NextResponse.redirect(url));
  }

  return session.applyTo(intl(request));
}

export const config = {
  // Everything except Next internals, Vercel internals and static files.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
