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
