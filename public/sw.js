/*
 * Eventzo staff job app service worker (enhancement H).
 *
 * Only two things are handled; every other request goes straight to the network:
 *   1. Page loads of /vendor/jobs (and /kn/…, /hi/…): network first. A good,
 *      signed-in response is saved so the job list stays readable without a
 *      signal (common at venues). Without a network it serves that copy.
 *   2. Next.js static assets (/_next/static/*, content-hashed): cache first, so
 *      the saved page can still load its styles and scripts offline.
 *
 * The saved page is removed when the person signs out (the app posts
 * {type: "clear"}) or when the server answers with a redirect (signed out).
 */
const PAGES = "eventzo-jobs-pages-v1";
const STATIC = "eventzo-static-v1";
const JOBS_PATH = /^\/(?:(?:kn|hi)\/)?vendor\/jobs\/?$/;
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, STATIC]);
      for (const key of await caches.keys()) {
        if (key.startsWith("eventzo-") && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear") {
    event.waitUntil(caches.delete(PAGES));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate" && JOBS_PATH.test(url.pathname)) {
    event.respondWith(jobsPage(req, url));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticAsset(req));
  }
});

async function jobsPage(req, url) {
  const cache = await caches.open(PAGES);
  const key = url.origin + url.pathname.replace(/\/$/, "");
  const network = fetch(req).then(async (res) => {
    if (res.redirected || !res.ok) {
      // Signed out or an error page: never keep (or serve) an old private copy.
      if (res.redirected) await cache.delete(key);
      return res;
    }
    await cache.put(key, res.clone());
    return res;
  });

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    // Slow network: show the saved copy if there is one, else keep waiting.
    const saved = await cache.match(key, { ignoreVary: true, ignoreSearch: true });
    return saved || (await network);
  } catch {
    const saved = await cache.match(key, { ignoreVary: true, ignoreSearch: true });
    if (saved) return saved;
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
        "<title>Eventzo Jobs</title><body style='font-family:system-ui;padding:24px;background:#FBF7F0;color:#26262A'>" +
        "<h1 style='font-size:20px'>You are offline</h1><p>Open the job list once with a connection, " +
        "and it will be available here without one.</p></body>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function staticAsset(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    // Old deployments' chunks pile up: keep the newest ~300.
    const keys = await cache.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - 300))) await cache.delete(old);
  }
  return res;
}
