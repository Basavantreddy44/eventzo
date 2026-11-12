import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 1 acceptance:
 *  - register, then log in
 *  - a customer is blocked from /vendor and /admin
 * Requires a Supabase project with email confirmation disabled (local stack).
 */

const PASSWORD = "Mantapa2027";

function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

async function register(page: Page, email: string, name = "E2E Customer") {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
}

test.describe("authentication", () => {
  test("a visitor can register, sign out and log back in", async ({ page }) => {
    const email = uniqueEmail("register");
    await register(page, email);
    await expect(page.getByTestId("platform-roles")).toContainText("Customer");

    await signOut(page);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
  });

  test("wrong password shows an error and stays on login", async ({ page }) => {
    const email = uniqueEmail("wrongpw");
    await register(page, email);
    await signOut(page);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Wrong12345");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    // Next.js also renders an empty role="alert" route announcer, so target the form's alert.
    await expect(page.locator("form [role=alert]")).toContainText("Email or password is incorrect.");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("password visibility (eye icon)", () => {
  test("login: the eye button reveals and hides the password", async ({ page }) => {
    await page.goto("/login");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("Secret123");
    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("Secret123");
    await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("register: each password field toggles independently and the form still submits", async ({ page }) => {
    await page.goto("/register");
    const password = page.getByLabel("Password", { exact: true });
    const confirm = page.getByLabel("Confirm password", { exact: true });
    await password.fill(PASSWORD);
    await confirm.fill(PASSWORD);

    await page.getByRole("button", { name: "Show password" }).first().click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(confirm).toHaveAttribute("type", "password");

    // Clicking the eye must never submit the form.
    await expect(page).toHaveURL(/\/register$/);

    await page.getByLabel("Full name").fill("Eye Toggle");
    await page.getByLabel("Email").fill(uniqueEmail("eye"));
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });
});

test.describe("authorisation", () => {
  test("signed-out visitors are sent to login with a return path", async ({ page }) => {
    for (const path of ["/account", "/vendor", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
    }
  });

  test("a customer is blocked from the vendor ERP and the admin area", async ({ page }) => {
    await register(page, uniqueEmail("blocked"));

    await page.goto("/vendor");
    await expect(page.getByTestId("access-denied")).toBeVisible();
    await expect(page.getByRole("heading", { name: "You don't have access" })).toBeVisible();
    await expect(page.getByText("The vendor dashboard is for registered businesses.")).toBeVisible();

    await page.goto("/admin");
    await expect(page.getByTestId("access-denied")).toBeVisible();
    await expect(page.getByText("This area is restricted to Eventzo staff.")).toBeVisible();
  });

  test("localised routes keep the locale prefix", async ({ page }) => {
    await page.goto("/kn/vendor");
    await expect(page).toHaveURL(/\/kn\/login\?next=%2Fkn%2Fvendor$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "kn");
  });
});
