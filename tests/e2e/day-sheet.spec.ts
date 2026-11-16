import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Roadmap Phase B batch 3b: typical costs from the guest count and a warning
 * before booking above the plan (C13), the event day sheet (C9), and the
 * large-text mode with a visible language switch (C12). DEV seed + payment simulator.
 */

const PASSWORD = "Mantapa2027";
const MAIN_HALL = "/listings/sample-lakshmi-main-hall";
const VENDOR = "vendor.kalaburagi@sample.eventzo.test";

function futureDate(minDays: number, spread: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + minDays + Math.floor(Math.random() * spread));
  return d.toISOString().slice(0, 10);
}

async function register(page: Page, name: string) {
  const email = `e2e-ds-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  await page.getByLabel(/I agree to the Terms of Use/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/**
 * A live vendor always has a contact phone (it's required to go live); the dev
 * seed hall skips that step, so give it one. Local stack only.
 */
async function ensureSeedVendorPhone() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("local stack only");
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: org } = await db
    .from("organizations")
    .select("id")
    .eq("name", "Sample Lakshmi Kalyana Mantapa")
    .single();
  const { error } = await db
    .from("business_profiles")
    .update({ contact_phone: "+919845000777" })
    .eq("organization_id", org!.id)
    .is("contact_phone", null);
  if (error) throw error;
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Eventzo2027");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("C13 + C9: typical costs, a warning before booking over plan, then the day sheet", async ({ browser }) => {
  test.slow();
  await ensureSeedVendorPhone();
  const host = await (await browser.newContext()).newPage();
  const vendor = await (await browser.newContext()).newPage();
  await register(host, "Day Sheet Host");
  await login(vendor, VENDOR);

  // An event for 300 guests in Kalaburagi.
  await host.goto("/account/events");
  const form = host.getByRole("form", { name: "New event" });
  const title = `Asha weds Ravi ${Date.now()}`;
  await form.getByLabel("Event name").fill(title);
  await form.getByLabel("Type of event").selectOption("wedding");
  await form.getByLabel("City").selectOption({ label: "Kalaburagi" });
  await form.getByLabel("Expected guests").fill("300");
  let date = futureDate(90, 500);
  await form.getByLabel("Date").fill(date);
  await form.getByTestId("create-event").click();
  await expect(host).toHaveURL(/\/account\/events\/[0-9a-f-]{36}$/);
  const eventId = new URL(host.url()).pathname.split("/").pop()!;

  // Budget: typical ranges for 300 guests, before any plan exists.
  await host.getByTestId("tab-budget").click();
  const typical = host.getByTestId("budget-typical");
  await expect(typical).toContainText("Typical costs for 300 guests in Kalaburagi");
  await expect(typical).toContainText("Catering");
  // A tight plan for the venue: ₹1,00,000.
  const line = host.getByRole("form", { name: "Plan a category" });
  await line.getByLabel("Category").selectOption({ label: "Venues" });
  await line.getByLabel("Planned (₹)").fill("1,00,000");
  await line.getByRole("button", { name: "Add to budget" }).click();
  await expect(host.getByTestId("budget-planned")).toHaveText("₹1,00,000");

  // Enquire for the hall on the event's date (filed under the event), get a ₹1,50,000 quote.
  await host.goto(MAIN_HALL);
  await host.waitForLoadState("networkidle");
  const panel = host.getByTestId("enquiry-panel");
  const availability = host.getByTestId("availability");
  for (let attempt = 0; ; attempt++) {
    await panel.getByLabel("Event date").fill(date);
    await expect(availability).not.toContainText("Checking");
    await expect(availability).toContainText(/Available|Not available/);
    if (!(await availability.textContent())?.includes("Not available")) break;
    if (attempt === 4) throw new Error("No free date found in 5 tries");
    date = futureDate(90, 500);
  }
  await expect(panel.getByTestId("enquiry-panel-event")).toHaveValue(eventId);
  await panel.getByRole("button", { name: "Send enquiry" }).click();
  await expect(host).toHaveURL(/\/account\/enquiries\/[0-9a-f-]{36}$/);
  const enquiryId = new URL(host.url()).pathname.split("/").pop()!;
  await vendor.goto(`/vendor/enquiries/${enquiryId}`);
  await vendor.getByRole("form", { name: "Send a quotation" }).getByRole("button", { name: "Send quotation" }).click();
  await expect(vendor.getByText("Quotation sent.")).toBeVisible();
  await host.reload();
  await host.getByTestId("accept-quote").click();
  await host.getByRole("alertdialog").getByRole("button", { name: "Accept quote" }).click();
  await expect(host.getByText("Quote accepted.")).toBeVisible();

  // C13: booking above the plan is flagged before booking.
  await expect(host.getByTestId("over-plan")).toContainText("₹50,000 over your plan of ₹1,00,000");
  await host.getByTestId("book-card").getByTestId("book-now").click();
  await host.getByRole("alertdialog").getByRole("button", { name: "Book now" }).click();
  await expect(host).toHaveURL(/\/account\/bookings\/[0-9a-f-]{36}$/);

  // C9: nothing on the day sheet until confirmed.
  await host.goto(`/account/events/${eventId}?tab=day`);
  await expect(host.getByText("No confirmed vendors yet")).toBeVisible();
  await host.goBack();
  await host.getByTestId("pay-online").click();
  await host.getByTestId("sim-pay").click();
  await expect(host.getByText("Booking confirmed").first()).toBeVisible();

  await host.goto(`/account/events/${eventId}?tab=day`);
  const row = host.getByTestId("day-sheet-row").filter({ hasText: "Sample Lakshmi" });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("day-sheet-arrival")).toHaveText(/\d{1,2}:\d{2}/);
  await expect(row.getByTestId("day-sheet-phone")).toHaveAttribute("href", /^tel:\+91/);
  await expect(host.getByRole("link", { name: "Share on WhatsApp" })).toHaveAttribute("href", /wa\.me/);

  // The budget now shows the venue over plan.
  await host.getByTestId("tab-budget").click();
  await expect(host.getByTestId("budget-row-over")).toContainText("₹50,000 over plan");
  await expect(host.getByTestId("budget-over-categories")).toContainText("Venues");
});

test("C12: the language switch shows the current language, and large text is remembered", async ({ page }) => {
  await page.goto("/");
  const switcher = page.getByTestId("locale-switcher");
  await expect(switcher).toContainText("EN");
  await switcher.click();
  await page.getByTestId("large-text-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-text", "large");
  await page.goto("/search");
  await expect(page.locator("html")).toHaveAttribute("data-text", "large");
  await page.getByTestId("locale-switcher").click();
  await expect(page.getByTestId("large-text-toggle")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("large-text-toggle").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-text", "large");
});
