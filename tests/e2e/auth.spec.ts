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
  await page.getByLabel(/I agree to the Terms of Use/).check();
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
    await page.getByLabel(/I agree to the Terms of Use/).check();
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

    // QA B4: leaving the denied page by in-app navigation must not keep the panel on screen.
    await page.getByRole("link", { name: "My account" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
    // (Next may keep the previous page mounted but hidden; it must not be visible.)
    await expect(page.getByTestId("access-denied")).toBeHidden();

    // QA B5: the server answers with a redirect, not a 200 admin page.
    for (const path of ["/admin", "/admin/users", "/vendor", "/vendor/finance"]) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers()["location"], path).toMatch(/\/access-denied\?area=(admin|vendor)$/);
    }
  });

  test("after moving from login to register in the app, clicking a label fills the visible field (QA B9)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Create an account" }).click();
    await expect(page).toHaveURL(/\/register$/);
    // Click the label text itself: it must focus the register form's field, not the hidden login one.
    const form = page.getByRole("form", { name: "Create your account" });
    await form.getByText("Email", { exact: true }).click();
    await page.keyboard.type("label-check@example.test");
    await expect(form.getByLabel("Email")).toHaveValue("label-check@example.test");
    // Every id on the page is unique, even with the login page kept alive in the background.
    const duplicates = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const el of document.querySelectorAll("[id]")) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
      return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
    });
    expect(duplicates).toEqual([]);
  });

  test("localised routes keep the locale prefix", async ({ page }) => {
    await page.goto("/kn/vendor");
    await expect(page).toHaveURL(/\/kn\/login\?next=%2Fkn%2Fvendor$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "kn");
  });
});

test.describe("legal pages and consent (Roadmap A8)", () => {
  test("footer links open the four policies, marked as drafts until reviewed", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("navigation", { name: "Legal" });
    for (const [link, heading] of [
      ["Terms of Use", "Terms of Use"],
      ["Privacy Policy", "Privacy Policy"],
      ["Refund & Cancellation", "Refund & Cancellation Policy"],
      ["Vendor Agreement", "Vendor Agreement"],
    ]) {
      await page.goto("/");
      await footer.getByRole("link", { name: link }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByTestId("policy-draft")).toContainText("under legal review");
    }
  });

  test("sign-up needs the Terms and Privacy tick", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("No Tick");
    await page.getByLabel("Email").fill(uniqueEmail("notick"));
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Please accept the Terms of Use and Privacy Policy to continue.")).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });
});
