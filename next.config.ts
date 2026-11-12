import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

function isLocalSupabase() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return false;
  const host = new URL(raw).hostname;
  return host === "127.0.0.1" || host === "localhost";
}

// Listing photos are served from the public "listing-media" Supabase bucket.
function supabaseImagePattern() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  const url = new URL(raw);
  return [
    {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      port: url.port,
      pathname: "/storage/v1/object/public/listing-media/**",
    },
  ];
}

/**
 * Content-Security-Policy. Next.js renders small inline bootstrap scripts, so
 * script-src needs 'unsafe-inline' (no per-request nonces: pages are partly
 * prerendered). Everything else is limited to this site, Supabase (API,
 * storage, realtime) and Razorpay checkout.
 */
function contentSecurityPolicy() {
  const isDev = process.env.NODE_ENV !== "production";
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase = raw ? new URL(raw).origin : "";
  const supabaseWs = supabase.replace(/^http/, "ws");
  const razorpay = "https://*.razorpay.com";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", razorpay, ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabase, razorpay].filter(Boolean),
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabase, supabaseWs, razorpay].filter(Boolean),
    "frame-src": [razorpay],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

const isHttpsSite = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // Pin the root: a stray package-lock.json in the user home folder confuses detection.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  poweredByHeader: false,
  images: {
    remotePatterns: supabaseImagePattern(),
    // Only when Supabase itself is the local Docker stack (127.0.0.1); never for a hosted project.
    dangerouslyAllowLocalIP: isLocalSupabase(),
  },
  async headers() {
    return [
      {
        // Staff job app service worker: always revalidate so fixes reach phones quickly.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/staff.webmanifest",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          ...(isHttpsSite
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
