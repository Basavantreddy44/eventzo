import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 8 acceptance: vendor suspension (owner sees why; reinstate), user
 * support view + sign-in block (signed out, can't sign in, unblock), platform
 * roles, categories & cities, audit log, payments ledger, permission gates.
 * Uses the DEV seed admin; every test creates its own vendor/users so the
 * shared sample vendors are never suspended.
 */

const PASSWORD = "Mantapa2027";
const ADMIN = "admin@sample.eventzo.test";
const unique = (tag: string) => `${tag}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

async function register(page: Page, name: string) {
  const email = `${unique("e2e-adm")}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

test("vendor suspension: the owner is told why, the vendor is hidden, and an admin reinstates", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  const business = unique("Suspend Mantapa");

  await register(owner, "Suspended Owner");
  await owner.goto("/become-a-vendor");
  await owner.getByLabel("Business name").fill(business);
  await owner.getByLabel("Primary category").selectOption({ label: "Venues" });
  await owner.getByLabel("City", { exact: true }).selectOption({ label: "Kalaburagi, Karnataka" });
  await owner.getByRole("button", { name: "Create business workspace" }).click();
  await expect(owner).toHaveURL(/\/vendor$/);

  await login(admin, ADMIN, "Eventzo2027");
  await expect(admin).toHaveURL(/\/account$/);
  await admin.goto(`/admin/vendors?q=${encodeURIComponent(business)}`);
  await expect(admin.getByTestId("vendor-count")).toHaveText("1 vendor");
  await admin.getByRole("link", { name: business }).click();
  await expect(admin.getByRole("heading", { level: 1, name: business })).toBeVisible();

  const actions = admin.getByTestId("vendor-status-actions");
  await expect(actions.getByTestId("vendor-suspend")).toBeDisabled(); // no reason yet
  await actions.getByLabel(/Reason/).fill("Fake reviews reported by customers");
  await actions.getByTestId("vendor-suspend").click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Suspend" }).click();
  await expect(admin.getByText("Vendor suspended.")).toBeVisible();
  await expect(admin.getByTestId("status-reason")).toContainText("Fake reviews reported by customers");

  await owner.goto("/vendor");
  const banner = owner.getByTestId("suspended-banner");
  await expect(banner).toContainText("Your business is suspended");
  await expect(banner).toContainText("Fake reviews reported by customers");
  await expect(banner).toContainText("Existing bookings continue");

  await admin.getByTestId("vendor-reinstate").click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Reinstate" }).click();
  await expect(admin.getByText("Vendor reinstated.")).toBeVisible();
  // Not complete yet (no listing), so it returns to draft rather than going live.
  await expect(admin.getByTestId("vendor-badges")).toContainText("Draft");
  await owner.reload();
  await expect(owner.getByTestId("suspended-banner")).toHaveCount(0);

  // The audit log shows the change for this vendor.
  await admin.getByRole("link", { name: "Audit history for this vendor" }).click();
  await expect(admin.getByTestId("audit-entries")).toContainText("organizations.update");
});

test("support view, sign-in block and unblock; platform roles", async ({ browser }) => {
  test.slow();
  const person = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  const name = unique("Blocky Person");
  const email = await register(person, name);

  await login(admin, ADMIN, "Eventzo2027");
  await expect(admin).toHaveURL(/\/account$/);
  await admin.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  await admin.getByRole("link", { name }).click();
  await expect(admin.getByText("Read-only support view.")).toBeVisible();
  await expect(admin.getByText("Joined")).toBeVisible();

  // Block: needs a reason; the person is signed out and can't sign back in.
  const block = admin.getByTestId("user-block");
  await expect(block.getByTestId("user-block-button")).toBeDisabled();
  await block.getByLabel(/Reason/).fill("Fake enquiries to many vendors");
  await block.getByTestId("user-block-button").click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Block sign-in" }).click();
  await expect(admin.getByText("Sign-in blocked.")).toBeVisible();
  await expect(admin.getByTestId("blocked-reason")).toContainText("Fake enquiries to many vendors");

  await person.goto("/account");
  await expect(person).toHaveURL(/\/login/);
  await login(person, email, PASSWORD);
  await expect(person.getByText("This account has been blocked.")).toBeVisible();

  await admin.getByTestId("user-unblock").click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Unblock" }).click();
  await expect(admin.getByText("Unblocked.")).toBeVisible();
  await login(person, email, PASSWORD);
  await expect(person).toHaveURL(/\/account$/);

  // Roles: finance access appears and goes away again.
  await person.goto("/admin/payments");
  await expect(person.getByTestId("access-denied")).toBeVisible();
  await admin.getByTestId("role-finance_operator").click();
  await expect(admin.getByText("Role granted.")).toBeVisible();
  await person.goto("/admin/payments");
  await expect(person.getByRole("heading", { level: 1, name: "Payments ledger" })).toBeVisible();
  await expect(person.getByTestId("ledger-totals")).toBeVisible();
  // A finance operator sees only the admin pages for their role.
  await expect(person.getByRole("link", { name: "Categories & cities" })).toHaveCount(0);
  await person.goto("/admin/taxonomy");
  await expect(person.getByTestId("no-permission")).toBeVisible();
  await admin.getByTestId("role-finance_operator").click();
  await expect(admin.getByText("Role revoked.")).toBeVisible();
  await person.goto("/admin/payments");
  await expect(person.getByTestId("access-denied")).toBeVisible();

  await admin.goto("/admin/audit?action=user.blocked");
  await expect(admin.getByTestId("audit-entries").first()).toContainText("Fake enquiries to many vendors");
});

test("categories & cities: add an area, refuse a duplicate, hide it", async ({ page }) => {
  const area = unique("E2E Nagar");
  await login(page, ADMIN, "Eventzo2027");
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/admin/taxonomy?tab=areas");
  const form = page.getByRole("form", { name: "Area" });
  await form.getByLabel("City", { exact: true }).selectOption({ label: "Kalaburagi" });
  await form.getByLabel("Name (English)").fill(area);
  await expect(form.getByLabel("URL name")).toHaveValue(area.toLowerCase().replace(/ /g, "-"));
  await form.getByLabel("Name in Kannada").fill("ಪರೀಕ್ಷಾ ನಗರ");
  await form.getByLabel("PIN code").fill("585101");
  await form.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Saved.").first()).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: area });
  await expect(row).toContainText("585101");

  // A duplicate URL name is refused.
  await form.getByLabel("Name (English)").fill(area);
  await form.getByRole("button", { name: "Add" }).click();
  await expect(form.getByText("That URL name is already used.")).toBeVisible();

  await row.getByRole("button", { name: "Hide" }).click();
  await expect(row).toContainText("Hidden");
});

test("admin pages are closed to customers and fit a phone", async ({ browser }) => {
  const customer = await (await browser.newContext()).newPage();
  await login(customer, "customer@sample.eventzo.test", "Eventzo2027");
  await expect(customer).toHaveURL(/\/account$/);
  for (const path of ["/admin/vendors", "/admin/users", "/admin/audit", "/admin/payments", "/admin/taxonomy"]) {
    await customer.goto(path);
    await expect(customer.getByTestId("access-denied")).toBeVisible();
  }

  const admin = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await login(admin, ADMIN, "Eventzo2027");
  await expect(admin).toHaveURL(/\/account$/);
  for (const path of ["/admin/vendors", "/admin/users", "/admin/audit", "/admin/payments", "/admin/taxonomy"]) {
    await admin.goto(path);
    await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
    const { scroll, viewport } = await admin.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(scroll, `${path} overflows horizontally`).toBeLessThanOrEqual(viewport);
  }
});
