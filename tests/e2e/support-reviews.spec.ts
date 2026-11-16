import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Roadmap Phase B batch 3a: payment timeline (C8), verified reviews with a
 * vendor reply (C7), Help button → support desk (C10/S2).
 * Uses the DEV seed (Sample Lakshmi halls, vendor + admin logins) and the
 * payment simulator, like bookings.spec.ts.
 */

const PASSWORD = "Mantapa2027";
const MAIN_HALL = "/listings/sample-lakshmi-main-hall";
const VENDOR = "vendor.kalaburagi@sample.eventzo.test";
const ADMIN = "admin@sample.eventzo.test";

function randomDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 60 + Math.floor(Math.random() * 600));
  return d.toISOString().slice(0, 10);
}

/** Local stack only (playwright.config refuses hosted projects): moves an event into the past. */
async function moveEventToPast(itemId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("local stack only");
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const past = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const { error } = await db.from("booking_items").update({ event_date: past }).eq("id", itemId);
  if (error) throw error;
}

async function registerCustomer(page: Page, name: string) {
  const email = `e2e-b3-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  await page.getByLabel(/I agree to the Terms of Use/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Eventzo2027");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** Customer enquires, the vendor quotes, the customer accepts and books. Returns the booking item id. */
async function book(customer: Page, vendor: Page) {
  await customer.goto(MAIN_HALL);
  await customer.waitForLoadState("networkidle");
  const panel = customer.getByTestId("enquiry-panel");
  const availability = customer.getByTestId("availability");
  for (let attempt = 0; ; attempt++) {
    await panel.getByLabel("Event date").fill(randomDate());
    await expect(availability).not.toContainText("Checking");
    await expect(availability).toContainText(/Available|Not available/);
    if (!(await availability.textContent())?.includes("Not available")) break;
    if (attempt === 4) throw new Error("No free date found in 5 tries");
  }
  await panel.getByRole("button", { name: "Send enquiry" }).click();
  await expect(customer).toHaveURL(/\/account\/enquiries\/[0-9a-f-]{36}$/);
  const enquiryId = new URL(customer.url()).pathname.split("/").pop()!;

  await vendor.goto(`/vendor/enquiries/${enquiryId}`);
  await vendor.getByRole("form", { name: "Send a quotation" }).getByRole("button", { name: "Send quotation" }).click();
  await expect(vendor.getByText("Quotation sent.")).toBeVisible();

  await customer.reload();
  await customer.getByTestId("accept-quote").click();
  await customer.getByRole("alertdialog").getByRole("button", { name: "Accept quote" }).click();
  await expect(customer.getByText("Quote accepted.")).toBeVisible();
  await customer.getByTestId("book-card").getByTestId("book-now").click();
  await customer.getByRole("alertdialog").getByRole("button", { name: "Book now" }).click();
  await expect(customer).toHaveURL(/\/account\/bookings\/[0-9a-f-]{36}$/);
  return new URL(customer.url()).pathname.split("/").pop()!;
}

test("C8 + C7: payment timeline, then a verified review after the event with the vendor's reply", async ({
  browser,
}) => {
  test.slow();
  const customer = await (await browser.newContext()).newPage();
  const vendor = await (await browser.newContext()).newPage();
  await registerCustomer(customer, "Review Customer");
  await login(vendor, VENDOR);
  const itemId = await book(customer, vendor);

  // Waiting for the advance.
  const timeline = customer.getByTestId("payment-timeline");
  await expect(timeline.getByTestId("timeline-advance")).toHaveAttribute("data-state", "due");
  await customer.getByTestId("pay-online").click();
  await customer.getByTestId("sim-pay").click();
  await expect(customer.getByText("Booking confirmed").first()).toBeVisible();
  // Advance paid → the balance is next, with its due date and reminders.
  await expect(timeline.getByTestId("timeline-advance")).toHaveAttribute("data-state", "done");
  await expect(timeline.getByTestId("timeline-balance")).toHaveAttribute("data-state", "due");
  await expect(timeline.getByTestId("timeline-balance")).toContainText("We'll remind you 7 days and 1 day before");
  // No review before the event.
  await expect(customer.getByTestId("review-form")).toHaveCount(0);

  await moveEventToPast(itemId);
  await customer.reload();
  const text = `Spacious hall, helpful staff ${Date.now()}`;
  const form = customer.getByTestId("review-form");
  await expect(customer.getByText("How was it?", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Post review" }).click();
  await expect(form.getByText("Choose a rating from 1 to 5 stars.")).toBeVisible();
  await form.getByTestId("review-star-5").click();
  await expect(form.getByText("Excellent")).toBeVisible();
  await form.getByLabel("What went well, and what could be better?").fill(text);
  await form.getByRole("button", { name: "Post review" }).click();
  await expect(customer.getByText("Thank you for your review!")).toBeVisible();
  await expect(customer.getByText("Your review", { exact: true })).toBeVisible();
  await expect(customer.getByTestId("review")).toContainText("Verified booking");

  // The vendor sees it on the booking and replies publicly.
  await vendor.goto(`/vendor/bookings/${itemId}`);
  const card = vendor.getByTestId("vendor-review");
  await expect(card).toContainText(text);
  await card.getByLabel("Your public reply").fill("Thank you for choosing us!");
  await card.getByRole("button", { name: "Post reply" }).click();
  await expect(vendor.getByText("Reply saved.")).toBeVisible();

  // Visitors see the verified review and the reply on the listing.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(MAIN_HALL);
  const reviews = visitor.getByTestId("listing-reviews");
  const mine = reviews.getByTestId("review").filter({ hasText: text });
  await expect(mine).toContainText("Verified booking");
  await expect(mine).toContainText("Review C.");
  await expect(mine.getByTestId("review-reply")).toContainText("Thank you for choosing us!");
  await expect(reviews.getByTestId("rating-average")).toBeVisible();

  // After the reply the customer can no longer edit.
  await customer.reload();
  await expect(customer.getByText("Edit my review")).toHaveCount(0);
});

test("C10/S2: Help on a booking opens a ticket the support desk handles on one screen", async ({ browser }) => {
  test.slow();
  const customer = await (await browser.newContext()).newPage();
  const vendor = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  await registerCustomer(customer, "Help Customer");
  await login(vendor, VENDOR);
  const itemId = await book(customer, vendor);

  await customer.getByTestId("help-open").click();
  const help = customer.getByTestId("help-form");
  await help.getByTestId("help-submit").click();
  await expect(help.getByText("Choose what you need help with.")).toBeVisible();
  await help.getByLabel("Cancel the booking").check();
  await expect(help.getByTestId("help-cancel-hint")).toContainText("shows the refund before you confirm");
  await help.getByLabel("Vendor not responding").check();
  await expect(help).toContainText("We aim to reply within 4 hours.");
  const problem = `The hall manager does not pick up ${Date.now()}`;
  await help.getByLabel("Tell us more").fill(problem);
  await help.getByTestId("help-submit").click();
  await expect(customer).toHaveURL(/\/account\/support\/[0-9a-f-]{36}$/);
  const ticketId = new URL(customer.url()).pathname.split("/").pop()!;
  await expect(customer.getByTestId("ticket-thread")).toContainText(problem);
  await expect(customer.getByTestId("ticket-sla")).toContainText("First reply due by");
  await expect(customer.getByText("Open", { exact: true })).toBeVisible();

  // The booking page now links to the open request.
  await customer.goto(`/account/bookings/${itemId}`);
  await expect(customer.getByTestId("open-ticket-link")).toBeVisible();

  // Support desk: the ticket with the booking, payments and vendor chat on one screen.
  await login(admin, ADMIN);
  await admin.goto("/admin/support");
  await admin.goto(`/admin/support/${ticketId}`);
  await expect(admin.getByTestId("ticket-thread")).toContainText(problem);
  await expect(admin.getByTestId("ticket-booking")).toContainText("Sample Lakshmi");
  await expect(admin.getByTestId("ticket-paid")).toHaveText("₹0");
  const reply = admin.getByTestId("support-reply");
  await reply.getByRole("textbox").fill("Called the hall; manager on leave today.");
  await reply.getByTestId("support-internal").check();
  await reply.getByRole("button", { name: "Save note" }).click();
  await expect(admin.getByText("Note saved (only the team sees it).")).toBeVisible();
  await reply.getByRole("textbox").fill("We reached the vendor. They will call you today.");
  await reply.getByTestId("support-internal").uncheck();
  await reply.getByRole("button", { name: "Send" }).click();
  await expect(admin.getByText("Reply sent.")).toBeVisible();
  await admin.getByTestId("ticket-status").selectOption("resolved");
  await admin.getByTestId("ticket-save").click();
  await expect(admin.getByText("Request updated.")).toBeVisible();
  await expect(admin.getByTestId("ticket-history")).toContainText("status → Resolved");

  // The customer sees the reply (not the internal note), and can reopen by replying.
  await customer.goto(`/account/support/${ticketId}`);
  const thread = customer.getByTestId("ticket-thread");
  await expect(thread).toContainText("We reached the vendor. They will call you today.");
  await expect(thread).not.toContainText("manager on leave");
  await expect(customer.getByText("Resolved", { exact: true })).toBeVisible();
  await customer.getByTestId("support-reply").getByRole("textbox").fill("They still have not called.");
  await customer.getByTestId("support-reply").getByRole("button", { name: "Send" }).click();
  await expect(customer.getByText("Open", { exact: true })).toBeVisible();

  // Customers cannot open the desk.
  await customer.goto("/admin/support");
  await expect(customer).toHaveURL(/\/access-denied/);
});
