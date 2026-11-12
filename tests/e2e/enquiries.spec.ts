import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 4 acceptance: availability, enquiry with 48-hour hold, quotation,
 * acceptance, offline bookings (A), instant booking (G).
 * Uses the DEV seed: "Sample Lakshmi Kalyana Mantapa – Main Hall" (request-to-book,
 * linked to a resource) and "Sample Lakshmi Mini Hall" (instant booking).
 */

const PASSWORD = "Mantapa2027";
const MAIN_HALL = "/listings/sample-lakshmi-main-hall";
const MINI_HALL = "/listings/sample-lakshmi-mini-hall";

/** A random far-future date, so parallel/repeated runs don't fight over the same day. */
function randomDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 60 + Math.floor(Math.random() * 600));
  return d.toISOString().slice(0, 10);
}

async function registerCustomer(page: Page, name: string) {
  const email = `e2e-enq-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

async function loginVendor(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("vendor.kalaburagi@sample.eventzo.test");
  await page.getByLabel("Password", { exact: true }).fill("Eventzo2027");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function pickDate(page: Page, date: string) {
  // Wait for hydration: typing into the date field before React attaches its
  // handlers sets the value without triggering the availability check.
  await page.waitForLoadState("networkidle");
  const panel = page.getByTestId("enquiry-panel");
  await panel.getByLabel("Event date").fill(date);
  await expect(page.getByTestId("availability")).not.toContainText("Checking");
  return panel;
}

/**
 * Picks a random date that is free on this listing. The local database keeps
 * holds and bookings from earlier runs, so a random date can already be taken.
 */
async function pickFreeDate(page: Page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const date = randomDate();
    const panel = await pickDate(page, date);
    const availability = page.getByTestId("availability");
    await expect(availability).toContainText(/Available|Not available/);
    if (!(await availability.textContent())?.includes("Not available")) return { panel, date };
  }
  throw new Error("No free date found in 5 tries");
}

test("signed-out visitors are asked to log in before enquiring", async ({ page }) => {
  await page.goto(MAIN_HALL);
  await expect(page.getByText("Log in to check dates and send an enquiry.")).toBeVisible();
  await page.getByRole("link", { name: "Send enquiry" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Flistings%2Fsample-lakshmi-main-hall$/);
});

test("enquiry → 48h hold → vendor quote → customer accepts", async ({ browser }) => {
  const customer = await (await browser.newContext()).newPage();
  const other = await (await browser.newContext()).newPage();
  const vendor = await (await browser.newContext()).newPage();
  const customerEmail = await registerCustomer(customer, "Priya Enquiry");
  await customer.goto(MAIN_HALL);
  const { panel, date } = await pickFreeDate(customer);
  await panel.getByLabel("Guests").fill("400");
  await panel.getByLabel("Message to the vendor").fill("Wedding on this date, need dining for 400.");
  await panel.getByRole("button", { name: "Send enquiry" }).click();
  await expect(customer).toHaveURL(/\/account\/enquiries\/[0-9a-f-]{36}$/);
  const enquiryUrl = new URL(customer.url()).pathname;
  const enquiryId = enquiryUrl.split("/").pop()!;
  await expect(customer.getByText("Awaiting vendor")).toBeVisible();
  await expect(customer.getByTestId("hold-info")).toContainText(/47h|48h/);

  // The held date is now unavailable to everyone else.
  await registerCustomer(other, "Other Customer");
  await other.goto(MAIN_HALL);
  await pickDate(other, date);
  await expect(other.getByTestId("availability")).toContainText("Not available on this date");
  await expect(other.getByRole("button", { name: "Send enquiry" })).toBeDisabled();

  // Vendor sees it, contact hidden, sends a quote.
  await loginVendor(vendor);
  await vendor.goto("/vendor/enquiries");
  await expect(vendor.getByRole("link", { name: "Open" }).first()).toBeVisible();
  await vendor.goto(`/vendor/enquiries/${enquiryId}`);
  await expect(vendor.getByTestId("customer-contact")).toContainText(
    "Contact details are shared once the customer accepts a quote.",
  );
  await expect(vendor.getByText("Wedding on this date, need dining for 400.")).toBeVisible();
  const quote = vendor.getByRole("form", { name: "Send a quotation" });
  await expect(quote.getByLabel("Unit price (₹) 1")).toHaveValue("150000");
  await quote.getByLabel("Tax (%)").fill("18");
  await expect(vendor.getByTestId("quote-preview")).toContainText("₹1,77,000");
  await quote.getByRole("button", { name: "Send quotation" }).click();
  await expect(vendor.getByText("Quotation sent.")).toBeVisible();
  await expect(vendor.getByTestId("quote-v1").getByTestId("quote-total")).toHaveText("₹1,77,000");

  // Customer accepts.
  await customer.reload();
  await expect(customer.getByTestId("quote-v1").getByTestId("quote-total")).toHaveText("₹1,77,000");
  await customer.getByTestId("accept-quote").click();
  await customer.getByRole("alertdialog").getByRole("button", { name: "Accept quote" }).click();
  await expect(customer.getByText("Quote accepted.")).toBeVisible();
  await expect(customer.getByText("Accepted").first()).toBeVisible();

  // Messages flow both ways.
  await customer.getByLabel("Write a message…").fill("Thank you! Can we visit on Sunday?");
  await customer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(customer.getByTestId("messages")).toContainText("Can we visit on Sunday?");

  // After acceptance the vendor sees the customer's contact details.
  await vendor.reload();
  await expect(vendor.getByTestId("customer-contact")).toContainText(customerEmail);
  await expect(vendor.getByTestId("messages")).toContainText("Can we visit on Sunday?");
});

test("(A) an offline booking on the calendar blocks the date online", async ({ browser }) => {
  const vendor = await (await browser.newContext()).newPage();
  const customer = await (await browser.newContext()).newPage();
  let date = randomDate();

  await loginVendor(vendor);
  await vendor.goto("/vendor/calendar");
  const form = vendor.getByRole("form", { name: "Add to calendar" });
  await form.getByLabel("Resource").selectOption({ label: "Lakshmi main hall" });
  await form.getByLabel("Type").selectOption("offline");
  await form.getByLabel("Notes").fill("Phone booking – Mr Rao");
  // The local DB keeps earlier runs' bookings on this hall: if the random date is taken, try another.
  const added = vendor.getByText("Added to the calendar.");
  const taken = form.getByText("That time overlaps an existing hold, booking or block.");
  for (let attempt = 0; ; attempt++) {
    await form.getByLabel("Date").fill(date);
    await form.getByRole("button", { name: "Add to calendar" }).click();
    await expect(added.or(taken)).toBeVisible();
    if (await added.isVisible()) break;
    if (attempt === 4) throw new Error("No free date found in 5 tries");
    date = randomDate();
  }

  // Adding the same slot again is refused (double booking).
  await form.getByLabel("Date").fill(date);
  await form.getByRole("button", { name: "Add to calendar" }).click();
  await expect(form.getByText("That time overlaps an existing hold, booking or block.")).toBeVisible();

  await registerCustomer(customer, "Calendar Customer");
  await customer.goto(MAIN_HALL);
  await pickDate(customer, date);
  await expect(customer.getByTestId("availability")).toContainText("Not available on this date");
});

test("(G) instant-booking listings are reserved without a quote", async ({ page }) => {
  await registerCustomer(page, "Instant Customer");
  await page.goto(MINI_HALL);
  const { panel } = await pickFreeDate(page);
  await panel.getByRole("button", { name: "Reserve for 48 hours" }).click();
  await expect(page).toHaveURL(/\/account\/enquiries\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Reserved").first()).toBeVisible();

  await page.goto("/account/enquiries");
  await expect(page.getByRole("cell", { name: /Sample Lakshmi Mini Hall/ })).toBeVisible();
});

test("customers can cancel, which releases the date", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await registerCustomer(a, "Cancel Customer");
  await a.goto(MAIN_HALL);
  const { panel, date } = await pickFreeDate(a);
  await panel.getByRole("button", { name: "Send enquiry" }).click();
  await expect(a).toHaveURL(/\/account\/enquiries\//);
  await a.getByRole("button", { name: "Cancel enquiry" }).click();
  await a.getByRole("alertdialog").getByRole("button", { name: "Cancel enquiry" }).click();
  await expect(a.getByText("Enquiry cancelled.")).toBeVisible();

  await registerCustomer(b, "Next Customer");
  await b.goto(MAIN_HALL);
  await pickDate(b, date);
  await expect(b.getByTestId("availability")).toContainText("Available");
});

test("enquiry pages fit a phone screen", async ({ page }) => {
  await registerCustomer(page, "Mobile Enquirer");
  await page.goto(MAIN_HALL);
  const { panel } = await pickFreeDate(page);
  await panel.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page).toHaveURL(/\/account\/enquiries\//);
  for (const path of [new URL(page.url()).pathname, "/account/enquiries", MAIN_HALL]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const { scroll, viewport } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(scroll, `${path} overflows horizontally`).toBeLessThanOrEqual(viewport);
  }
});
