import { routing, type AppLocale } from "@/i18n/routing";

const PROTECTED_PREFIXES = ["/account", "/vendor", "/admin", "/receipts"] as const;

/** Splits "/kn/vendor/x" into { locale: "kn", path: "/vendor/x" }. */
export function stripLocale(pathname: string): { locale: AppLocale; path: string } {
  const [, first, ...rest] = pathname.split("/");
  if ((routing.locales as readonly string[]).includes(first ?? "")) {
    return { locale: first as AppLocale, path: "/" + rest.join("/") };
  }
  return { locale: routing.defaultLocale, path: pathname || "/" };
}

export function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}

/** Which role-gated portal a path belongs to (/admin or /vendor), if any. */
export function deniedPortal(path: string): "admin" | "vendor" | null {
  for (const portal of ["admin", "vendor"] as const) {
    if (path === `/${portal}` || path.startsWith(`/${portal}/`)) return portal;
  }
  return null;
}

/**
 * Validates a post-login redirect target. Only same-origin, absolute paths are
 * allowed — prevents open redirects via ?next=https://evil.example.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/account"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  try {
    const url = new URL(next, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
