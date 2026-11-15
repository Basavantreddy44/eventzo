import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { refreshSession } from "@/lib/supabase/proxy";
import { deniedPortal, isProtectedPath, stripLocale } from "@/lib/auth/paths";
import { isPlatformAdmin, isVendorMember } from "@/lib/auth/permissions";

const intl = createIntlMiddleware(routing);

/**
 * 1. Refresh the Supabase session (every request).
 * 2. Apply locale routing (next-intl), except for non-localised route handlers.
 * 3. Coarse gate: signed-out users can't open /account, /vendor or /admin.
 *    Real authorisation (roles, membership) happens server-side in each
 *    layout/page/action and in RLS. This gate is only for UX.
 * 4. Signed-in users without the role for /admin or /vendor get a 307 to
 *    /access-denied instead of a 200 portal page (QA B4, B5). The layouts
 *    check again; RLS remains the real enforcement.
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

  const portal = session.userId ? deniedPortal(path) : null;
  if (portal) {
    const access = await session.access();
    // Null access (blocked user, RPC error): let the layout decide.
    const allowed = !access || (portal === "admin" ? isPlatformAdmin(access) : isVendorMember(access));
    if (!allowed) {
      const deniedPath = locale === routing.defaultLocale ? "/access-denied" : `/${locale}/access-denied`;
      const url = new URL(deniedPath, request.url);
      url.searchParams.set("area", portal);
      return session.applyTo(NextResponse.redirect(url));
    }
  }

  return session.applyTo(intl(request));
}

export const config = {
  // Everything except Next internals, Vercel internals and static files.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
