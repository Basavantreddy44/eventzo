import type { MetadataRoute } from "next";
import { getPublicEnv } from "@/lib/env";

/** Public marketplace pages are crawlable; portals, receipts and private links are not. */
export default function robots(): MetadataRoute.Robots {
  const site = getPublicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const privatePaths = [
    "/account",
    "/vendor",
    "/admin",
    "/receipts",
    "/invite",
    "/login",
    "/register",
    "/api",
    "/auth",
  ];
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...privatePaths, ...["kn", "hi"].flatMap((l) => privatePaths.map((p) => `/${l}${p}`))],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
