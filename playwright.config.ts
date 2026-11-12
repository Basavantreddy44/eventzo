import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// E2E tests create real users and vendors. Refuse to run against a hosted
// Supabase project (e.g. Eventzoo) unless explicitly allowed.
loadEnvConfig(process.cwd());
const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1").hostname;
if (!["127.0.0.1", "localhost"].includes(supabaseHost) && process.env.E2E_ALLOW_REMOTE !== "1") {
  throw new Error(
    `E2E tests would write test data to ${supabaseHost}. Use the local stack ` +
      "(copy .env.docker over .env.local) or set E2E_ALLOW_REMOTE=1 if you really mean it.",
  );
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * E2E tests need the app running against a Supabase project where email
 * confirmation is DISABLED (the local stack from `npm run db:start` is
 * configured that way in supabase/config.toml).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The full Supabase stack + Next server + browsers saturate a small laptop at
  // 4+ workers (requests queue past timeouts). Override with PW_WORKERS.
  workers: Number(process.env.PW_WORKERS ?? 2),
  reporter: process.env.CI ? "github" : "list",
  // `next dev` compiles each route on first request, which can take several
  // seconds on a cold server; Server Action redirects wait on that compile.
  expect: { timeout: 30_000 },
  timeout: 90_000,
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
