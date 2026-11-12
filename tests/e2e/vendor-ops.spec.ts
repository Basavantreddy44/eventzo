import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 7 acceptance: staff roster with a linked login → assignment on a
 * confirmed booking → the staff member answers in the job app → payout as an
 * expense → finance & payments → printable receipt (customer only, not other
 * customers) → schedule, reports and the installable staff app.
 * Uses the DEV seed (Sample Lakshmi mini hall: instant booking, ₹45,000, 25% advance).
 */

const PASSWORD = "Mantapa2027";
const MINI_HALL = "/listings/sample-lakshmi-mini-hall";
const VENDOR = "vendor.kalaburagi@sample.eventzo.test";

function randomDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 60 + Math.floor(Math.random() * 600));
  return d.toISOString().slice(0, 10);
}

async function registerCustomer(page: Page, name: string) {
  const email = `e2e-ops-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
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

async function reserveInstant(page: Page) {
  await page.goto(MINI_HALL);
  await page.waitForLoadState("networkidle");
  const panel = page.getByTestId("enquiry-panel");
  const availability = page.getByTestId("availability");
  for (let attempt = 0; ; attempt++) {
    await panel.getByLabel("Event date").fill(randomDate());
    await expect(availability).not.toContainText("Checking");
    await expect(availability).toContainText(/Available|Not available/);
    if (!(await availability.textContent())?.includes("Not available")) break;
    if (attempt === 4) throw new Error("No free date found in 5 tries");
  }
  await panel.getByRole("button", { name: "Reserve for 48 hours" }).click();
  await expect(page).toHaveURL(/\/account\/enquiries\/[0-9a-f-]{36}$/);
  await page.getByTestId("book-card").getByTestId("book-now").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Book now" }).click();
  await expect(page).toHaveURL(/\/account\/bookings\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

test("staff: roster with login → assigned to a booking → answers in the job app → payout, finance and receipt", async ({
  browser,
}) => {
  test.slow(); // three people across the whole flow
  const staff = await (await browser.newContext()).newPage();
  const owner = await (await browser.newContext()).newPage();
  const customer = await (await browser.newContext()).newPage();
  const staffName = `E2E Cook ${Date.now().toString(36)}`;

  // The cook has an Eventzo account and joins the business as staff.
  const staffEmail = await registerCustomer(staff, staffName);
  await login(owner, VENDOR);
  await owner.goto("/vendor/team");
  const invite = owner.getByRole("form", { name: "Invite a team member" });
  await invite.getByLabel("Email", { exact: true }).fill(staffEmail);
  await invite.getByLabel("Role", { exact: true }).selectOption("staff");
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(owner.getByText("already has an Eventzo account")).toBeVisible();
  await staff.goto("/account");
  await staff.getByTestId("invitations").getByRole("button", { name: "Accept" }).first().click();
  await expect(staff).toHaveURL(/\/vendor$/);

  // The owner adds them to the roster with their login.
  await owner.goto("/vendor/staff");
  const roster = owner.getByRole("form", { name: "Add a staff member" });
  await roster.getByLabel("Full name").fill(staffName);
  await roster.getByLabel(/Skill or role/).fill("Head cook");
  await roster.getByLabel(/Usual day rate/).fill("1500");
  await roster.getByLabel("Eventzo login").selectOption({ label: staffName });
  await roster.getByRole("button", { name: "Add to roster" }).click();
  await expect(owner.getByText("Staff saved.")).toBeVisible();
  await expect(owner.getByRole("cell", { name: new RegExp(staffName) }).first()).toBeVisible();

  // A customer books; the vendor records the advance, which confirms the booking.
  await registerCustomer(customer, "Opsy Customer");
  const itemId = await reserveInstant(customer);
  await owner.goto(`/vendor/bookings/${itemId}`);
  const pay = owner.getByRole("form", { name: "Record a payment received" });
  await pay.getByLabel("Amount (₹)").fill("11250");
  await pay.getByLabel("Paid by").selectOption("cash");
  await pay.getByRole("button", { name: "Record payment" }).click();
  await expect(owner.getByTestId("booking-paid")).toHaveText("₹11,250");
  await expect(owner.getByTestId("receipt-link")).toBeVisible();

  // Staff the job.
  const team = owner.getByTestId("booking-team");
  const assign = team.getByRole("form", { name: "Assign staff" });
  await assign.getByLabel("Staff member").selectOption({ label: `${staffName} · Head cook` });
  await assign.getByLabel(/Role on this job/).fill("Head cook");
  await assign.getByLabel(/Pay for this job/).fill("2000");
  await assign.getByRole("button", { name: "Assign" }).click();
  await expect(owner.getByText("Staff assigned.")).toBeVisible();
  await expect(team.getByTestId("job-team")).toContainText(staffName);
  await expect(team.getByTestId("job-team")).toContainText("Awaiting reply");

  // The cook sees the job, the customer's first name (no phone yet), and accepts.
  await staff.goto("/vendor/jobs");
  await staff.waitForLoadState("networkidle");
  const job = staff.getByTestId("my-job").first();
  await expect(job).toContainText("Head cook");
  await expect(job).toContainText("Opsy");
  await expect(job).toContainText("Phone shown 2 days before the job");
  await expect(job).not.toContainText("@example.test");
  await expect(job).toContainText("Your pay: ₹2,000");
  await job.getByTestId("job-accept").click();
  await expect(staff.getByText("Job accepted.")).toBeVisible();
  await expect(job).toContainText("Accepted");
  await expect(job.getByTestId("job-check_in")).toHaveCount(0); // weeks away
  // Staff don't see money or the manager pages.
  await staff.goto("/vendor/finance");
  await expect(staff.getByText("Finance is for owners and branch managers.")).toBeVisible();
  await staff.goto(`/vendor/bookings/${itemId}`);
  await expect(staff.getByRole("heading", { name: "Page not found" })).toBeVisible();

  // The owner sees the answer and records the payout.
  await owner.reload();
  await expect(team.getByTestId("job-team")).toContainText("Accepted");
  await team.getByRole("form", { name: "Record payout" }).getByRole("button", { name: "Record payout" }).click();
  await expect(owner.getByText("Payout recorded as an expense.")).toBeVisible();
  await expect(team.getByTestId("job-team")).toContainText("Paid ₹2,000");

  // Finance: the payout is an expense; add another one by hand.
  await owner.goto("/vendor/finance?tab=expenses&range=this_month");
  await expect(owner.getByRole("cell", { name: new RegExp(`Staff payout.*${staffName}`) })).toBeVisible();
  const expense = owner.getByRole("form", { name: "Add expense" });
  const payee = `Flower market ${Date.now().toString(36)}`;
  await expense.getByLabel("Category").selectOption("decor_supplies");
  await expense.getByLabel("Amount (₹)").fill("750");
  await expense.getByLabel(/Paid to/).fill(payee);
  await expense.getByRole("button", { name: "Add expense" }).click();
  await expect(owner.getByText("Expense saved.")).toBeVisible();
  await expect(owner.getByRole("cell", { name: new RegExp(payee) })).toBeVisible();
  await owner.goto("/vendor/finance?tab=payments&range=this_month");
  await expect(owner.getByRole("link", { name: /^RCPT-\d{4}-\d{2}-\d{4,}$/ }).first()).toBeVisible();
  await owner.goto("/vendor/finance");
  await expect(owner.getByTestId("kpi-received")).not.toHaveText("₹0");

  // The customer opens a printable receipt from their booking.
  await customer.goto(`/account/bookings/${itemId}`);
  await customer.getByTestId("receipt-link").click();
  await expect(customer).toHaveURL(/\/receipts\/[0-9a-f-]{36}$/);
  await expect(customer.getByTestId("receipt-number")).toHaveText(/^RCPT-\d{4}-\d{2}-\d{4,}$/);
  await expect(customer.getByTestId("receipt-amount")).toHaveText("₹11,250");
  await expect(customer.getByText("Rupees Eleven Thousand Two Hundred Fifty Only")).toBeVisible();
  await expect(customer.getByTestId("receipt-balance")).toHaveText("₹33,750");
  await expect(customer.getByText("not a GST tax invoice")).toBeVisible();
  const receiptUrl = customer.url();

  // Nobody else can open it.
  const other = await (await browser.newContext()).newPage();
  await registerCustomer(other, "Nosy Customer");
  await other.goto(receiptUrl);
  await expect(other.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await staff.goto(receiptUrl);
  await expect(staff.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("schedule, reports and the installable staff app", async ({ page, request }) => {
  await login(page, VENDOR);
  await page.goto("/vendor/schedule?days=90");
  await expect(page.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();
  await expect(page.getByTestId("schedule-summary")).toContainText("without staff");

  await page.goto("/vendor/reports?range=this_fy");
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  await expect(page.getByTestId("report-funnel")).toBeVisible();
  await expect(page.getByRole("table", { name: "Resource use" })).toBeAttached();

  // A custom range that's too long falls back to the default.
  await page.goto("/vendor/finance?from=2020-01-01&to=2026-12-31");
  await expect(page.getByRole("link", { name: "This month" })).toHaveAttribute("aria-current", "true");

  await page.goto("/vendor/jobs");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/staff.webmanifest");
  const manifest = await request.get("/staff.webmanifest");
  expect(manifest.ok()).toBe(true);
  const json = await manifest.json();
  expect(json).toMatchObject({ name: "Eventzo Jobs", start_url: "/vendor/jobs", display: "standalone" });
  expect((await request.get("/icons/staff-512.png")).ok()).toBe(true);
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(sw.headers()["cache-control"]).toContain("no-cache");
});

test("receipts need sign-in; customers can't reach vendor finance", async ({ page }) => {
  await page.goto("/receipts/3f1c2b7e-9a4d-4c1e-8f2a-1b2c3d4e5f60");
  await expect(page).toHaveURL(/\/login\?next=%2Freceipts%2F/);
  await login(page, "customer@sample.eventzo.test");
  await page.goto("/vendor/finance");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
