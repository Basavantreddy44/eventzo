import { expect, test, type Page } from "@playwright/test";

/**
 * Runs with PAYMENTS_SIMULATOR=true and no Razorpay keys (dummy gateway).
 * Phase 5 acceptance: accepted quote → booking → advance (recorded offline by
 * the vendor) → confirmed → balance → customer cancels → refund queued and
 * returned by the vendor; instant booking cancelled by the vendor; online
 * payment shows why it's unavailable when Razorpay keys aren't configured;
 * finance refunds page; webhook endpoint refuses unconfigured/unsigned calls.
 * Uses the DEV seed (Sample Lakshmi halls, 25% advance, moderate policy).
 */

const PASSWORD = "Mantapa2027";
const MAIN_HALL = "/listings/sample-lakshmi-main-hall";
const MINI_HALL = "/listings/sample-lakshmi-mini-hall";

/** A random date 60–660 days ahead: far enough for a full refund under the moderate policy. */
function randomDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 60 + Math.floor(Math.random() * 600));
  return d.toISOString().slice(0, 10);
}

async function registerCustomer(page: Page, name: string) {
  const email = `e2e-bk-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Eventzo2027");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function enquire(page: Page, listing: string, button: "Send enquiry" | "Reserve for 48 hours") {
  await page.goto(listing);
  await page.waitForLoadState("networkidle");
  const panel = page.getByTestId("enquiry-panel");
  const availability = page.getByTestId("availability");
  // Earlier runs may still hold a random date on this hall: try another one.
  for (let attempt = 0; ; attempt++) {
    await panel.getByLabel("Event date").fill(randomDate());
    await expect(availability).not.toContainText("Checking");
    await expect(availability).toContainText(/Available|Not available/);
    if (!(await availability.textContent())?.includes("Not available")) break;
    if (attempt === 4) throw new Error("No free date found in 5 tries");
  }
  await panel.getByRole("button", { name: button }).click();
  await expect(page).toHaveURL(/\/account\/enquiries\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

async function bookFromEnquiry(page: Page) {
  const card = page.getByTestId("book-card");
  await card.getByTestId("book-now").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Book now" }).click();
  await expect(page).toHaveURL(/\/account\/bookings\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** Records a payment and waits until the vendor page shows the new paid total. */
async function recordPayment(vendor: Page, amount: string, paidAfter: string) {
  const form = vendor.getByRole("form", { name: "Record a payment received" });
  await form.getByLabel("Amount (₹)").fill(amount);
  await form.getByLabel("Paid by").selectOption("upi");
  await form.getByLabel("Reference").fill(`UPI-${Date.now()}`);
  await form.getByRole("button", { name: "Record payment" }).click();
  await expect(vendor.getByTestId("booking-paid")).toHaveText(paidAfter);
}

test("quote → booking → advance and balance recorded → customer cancels → vendor returns the refund", async ({
  browser,
}) => {
  test.slow(); // the whole lifecycle across two browsers
  const customer = await (await browser.newContext()).newPage();
  const vendor = await (await browser.newContext()).newPage();

  await registerCustomer(customer, "Booking Customer");
  const enquiryId = await enquire(customer, MAIN_HALL, "Send enquiry");

  await login(vendor, "vendor.kalaburagi@sample.eventzo.test");
  await vendor.goto(`/vendor/enquiries/${enquiryId}`);
  await vendor.getByRole("form", { name: "Send a quotation" }).getByRole("button", { name: "Send quotation" }).click();
  await expect(vendor.getByText("Quotation sent.")).toBeVisible();

  await customer.reload();
  await customer.getByTestId("accept-quote").click();
  await customer.getByRole("alertdialog").getByRole("button", { name: "Accept quote" }).click();
  await expect(customer.getByText("Quote accepted.")).toBeVisible();

  // Booking terms from the listing: 25% advance, moderate policy.
  const card = customer.getByTestId("book-card");
  await expect(card.getByTestId("book-total")).toHaveText("₹1,50,000");
  await expect(card.getByTestId("book-advance")).toHaveText("₹37,500");
  await expect(card).toContainText("Moderate");
  const itemId = await bookFromEnquiry(customer);

  await expect(customer.getByText("Awaiting advance").first()).toBeVisible();
  await expect(customer.getByTestId("pay-by")).toContainText(/\d+h \d+m left/);
  // The test server runs the payment simulator (PAYMENTS_SIMULATOR=true, no Razorpay keys).
  await expect(customer.getByTestId("sim-banner")).toContainText("simulated");
  // A failed attempt changes nothing...
  await customer.getByTestId("pay-online").click();
  await customer.getByRole("alertdialog").getByRole("button", { name: "Simulate a failure" }).click();
  await expect(customer.getByText("The payment failed. You can try again.")).toBeVisible();
  await expect(customer.getByText("Awaiting advance").first()).toBeVisible();
  // ...a successful one confirms the booking and the date.
  await customer.getByTestId("pay-online").click();
  await customer.getByTestId("sim-pay").click();
  await expect(customer.getByText("Booking confirmed").first()).toBeVisible();
  await expect(customer.getByTestId("booking-paid")).toHaveText("₹37,500");
  await expect(customer.getByTestId("booking-balance")).toHaveText("₹1,12,500");
  await expect(customer.getByTestId("payments")).toContainText("Simulated online payment (test)");

  // The enquiry now links to the booking (both sides).
  await vendor.goto(`/vendor/enquiries/${enquiryId}`);
  await vendor.getByTestId("booking-link").getByRole("link", { name: "View booking" }).click();
  await expect(vendor).toHaveURL(new RegExp(`/vendor/bookings/${itemId}$`));
  await expect(vendor.getByTestId("booking-customer")).toContainText("@example.test");
  await expect(vendor.getByText("Confirmed").first()).toBeVisible();

  // The balance is paid to the vendor by UPI. Over-paying is refused; the exact balance is accepted.
  const form = vendor.getByRole("form", { name: "Record a payment received" });
  await form.getByLabel("Amount (₹)").fill("200000");
  await form.getByRole("button", { name: "Record payment" }).click();
  await expect(form.getByText("The amount can't be more than the balance due.")).toBeVisible();
  await recordPayment(vendor, "112500", "₹1,50,000");
  await customer.reload();
  await expect(customer.getByTestId("fully-paid")).toBeVisible();

  // Customer cancels 60+ days ahead: moderate policy refunds everything.
  await customer.getByRole("button", { name: "Cancel booking" }).click();
  const dialog = customer.getByRole("alertdialog");
  await expect(dialog).toContainText("you'll get ₹1,50,000 back (100% of what you paid)");
  await dialog.getByRole("button", { name: "Cancel booking" }).click();
  await expect(customer.getByText("Booking cancelled. The date has been released.")).toBeVisible();
  await expect(customer.getByTestId("refunds")).toContainText("Refund due");

  // The vendor returns the UPI money and records it; finance handles the online part.
  await vendor.reload();
  const refunds = vendor.getByTestId("refunds");
  await expect(refunds).toContainText("Eventzo finance issues online refunds.");
  await refunds.getByPlaceholder("Reference").fill("UPI-RF-1");
  await refunds.getByRole("button", { name: "Mark refunded" }).click();
  await expect(vendor.getByText("Refund recorded.")).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await login(admin, "admin@sample.eventzo.test");
  await admin.goto("/admin/refunds");
  const row = admin.getByRole("row").filter({ hasText: "₹37,500" }).filter({ hasText: "Online" }).first();
  await row.getByRole("button", { name: "Issue refund" }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Issue refund" }).click();
  await expect(admin.getByText("Refund issued.")).toBeVisible();
  await customer.reload();
  await expect(customer.getByTestId("refunds")).toContainText("Refunded");

  await customer.goto("/account/bookings");
  await expect(customer.getByRole("cell", { name: /Sample Lakshmi Kalyana Mantapa/ }).first()).toBeVisible();
});

test("(G) instant booking at the listed price; a vendor cancellation needs a reason", async ({ browser }) => {
  const customer = await (await browser.newContext()).newPage();
  const vendor = await (await browser.newContext()).newPage();

  await registerCustomer(customer, "Instant Booker");
  await enquire(customer, MINI_HALL, "Reserve for 48 hours");
  await expect(customer.getByTestId("book-total")).toHaveText("₹45,000");
  await expect(customer.getByTestId("book-advance")).toHaveText("₹11,250");
  const itemId = await bookFromEnquiry(customer);

  await login(vendor, "vendor.kalaburagi@sample.eventzo.test");
  await vendor.goto(`/vendor/bookings/${itemId}`);
  const cancel = vendor.getByRole("button", { name: "Cancel booking" });
  await expect(cancel).toBeDisabled();
  await vendor.getByLabel("Reason").fill("Hall closed for repairs");
  await cancel.click();
  await expect(vendor.getByRole("alertdialog")).toContainText("Nothing has been paid yet");
  await vendor.getByRole("alertdialog").getByRole("button", { name: "Cancel booking" }).click();
  await expect(vendor.getByText("Booking cancelled. The date has been released.")).toBeVisible();

  await customer.reload();
  await expect(customer.getByText("Cancelled by the vendor: Hall closed for repairs")).toBeVisible();
});

test("finance sees the refunds queue; customers can't", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await login(admin, "admin@sample.eventzo.test");
  await admin.goto("/admin/refunds");
  await expect(admin.getByRole("heading", { level: 1, name: "Refunds" })).toBeVisible();
  await expect(admin.getByText("Payment simulator is on")).toBeVisible();

  const customer = await (await browser.newContext()).newPage();
  await login(customer, "customer@sample.eventzo.test");
  await customer.goto("/admin/refunds");
  await expect(customer.getByTestId("access-denied")).toBeVisible();
});

test("the Razorpay webhook refuses calls when not configured", async ({ request }) => {
  const res = await request.post("/api/webhooks/razorpay", {
    data: { event: "payment.captured" },
    headers: { "x-razorpay-signature": "0".repeat(64) },
  });
  expect(res.status()).toBe(503);
});

test("booking pages fit a phone screen", async ({ page }) => {
  await registerCustomer(page, "Mobile Booker");
  await enquire(page, MINI_HALL, "Reserve for 48 hours");
  await bookFromEnquiry(page);
  for (const path of [new URL(page.url()).pathname, "/account/bookings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const { scroll, viewport } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(scroll, `${path} overflows horizontally`).toBeLessThanOrEqual(viewport);
  }
});
