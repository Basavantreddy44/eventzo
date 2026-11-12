import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 2 acceptance: discovery, listing detail, city picker, muhurtham
 * calendar (B), budget estimator (F) and the admin price-range editor.
 * Relies on the DEV seed (supabase/seed.sql): 8 sample listings, sample
 * muhurtham dates and sample estimator ranges.
 */

test.describe("discovery", () => {
  test("search from the home page and open a listing", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox").first().fill("mantapa");
    await page.getByRole("button", { name: "Search", exact: true }).first().click();

    await expect(page).toHaveURL(/\/search\?q=mantapa/);
    const results = page.getByTestId("search-results");
    await expect(results.getByRole("link", { name: "Sample Lakshmi Kalyana Mantapa – Main Hall" })).toBeVisible();

    await results.getByRole("link", { name: "Sample Lakshmi Kalyana Mantapa – Main Hall" }).click();
    await expect(page).toHaveURL(/\/listings\/sample-lakshmi-main-hall$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sample Lakshmi Kalyana Mantapa – Main Hall" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Venue details" })).toBeVisible();
    await expect(page.getByText("From ₹1,50,000 / day").first()).toBeVisible();

    // Signed-out visitors are invited to log in before enquiring (Phase 4).
    await expect(page.getByText("Log in to check dates and send an enquiry.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Send enquiry" })).toBeVisible();
  });

  test("filters narrow the results and are reflected in the URL", async ({ page }) => {
    await page.goto("/search");
    const results = page.getByTestId("search-results");
    await expect(results.getByRole("link", { name: "Sample Lakshmi Mini Hall" })).toBeVisible();

    await page.getByLabel("Category").selectOption("venues");
    await page.getByLabel("Guests").fill("1000");
    await page.getByRole("button", { name: "Apply filters" }).click();

    await expect(page).toHaveURL(/category=venues/);
    await expect(page).toHaveURL(/guests=1000/);
    // Venues that seat 1000+: the two big halls, not the 150-guest mini hall or caterers.
    await expect(results.getByRole("link", { name: "Sample Royal Palace Grand Hall" })).toBeVisible();
    await expect(results.getByRole("link", { name: "Sample Lakshmi Kalyana Mantapa – Main Hall" })).toBeVisible();
    await expect(results.getByRole("link", { name: "Sample Lakshmi Mini Hall" })).toHaveCount(0);
    await expect(results.getByRole("link", { name: "Sample Bale Ele Oota Catering" })).toHaveCount(0);
    // Verified vendors rank first.
    await expect(page.getByTestId("search-results").locator("li").first()).toContainText("Verified");
  });

  test("an unknown listing shows not-found", async ({ page }) => {
    await page.goto("/listings/does-not-exist");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("the city picker remembers the city and filters search", async ({ page }) => {
    await page.goto("/search");
    await page.getByTestId("city-picker").click();
    await page.getByRole("menuitemradio", { name: "Kalaburagi" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Vendors in Kalaburagi" })).toBeVisible();
    const results = page.getByTestId("search-results");
    // Other suites add live vendors to this database, so narrow with a query.
    await page.goto("/search?q=Annapoorna");
    await expect(results.getByRole("link", { name: "Sample Annapoorna Pure Veg Catering" })).toBeVisible();
    await page.goto("/search?q=Royal%20Palace");
    await expect(page.getByRole("link", { name: "Sample Royal Palace Grand Hall" })).toHaveCount(0);

    // Remembered across pages (cookie).
    await page.goto("/muhurtham");
    await expect(page.getByText("Showing dates for Kalaburagi")).toBeVisible();
  });
});

test.describe("muhurtham calendar", () => {
  test("highlights auspicious dates and navigates months", async ({ page }) => {
    await page.goto("/muhurtham");
    await expect(page.getByRole("heading", { level: 1, name: "Muhurtham calendar" })).toBeVisible();
    const calendar = page.getByTestId("muhurtham-calendar");
    await expect(calendar).toBeVisible();

    // The dev seed publishes dates 12–75 days ahead, so this month or the next has highlights.
    let highlighted = await calendar.locator("[data-auspicious]").count();
    if (highlighted === 0) {
      await page.getByRole("link", { name: "Next month" }).click();
      await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
      highlighted = await page.getByTestId("muhurtham-calendar").locator("[data-auspicious]").count();
    }
    expect(highlighted).toBeGreaterThan(0);
  });

  test("the home page shows upcoming dates", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("upcoming-muhurtham").locator("li").first()).toBeVisible();
  });
});

test.describe("budget estimator", () => {
  test("estimates a range from the city's published price ranges", async ({ page }) => {
    await page.goto("/budget-estimator");
    await page.getByLabel("City", { exact: true }).selectOption("bengaluru");
    await page.getByLabel("Number of guests").fill("500");
    // Launch categories (venues, catering, decoration) are pre-selected.
    await page.getByRole("button", { name: "Estimate my budget" }).click();

    await expect(page).toHaveURL(/city=bengaluru/);
    // Sample ranges: venues ₹1.5L–₹10L, catering ₹400–₹1,200 × 500, décor ₹50k–₹5L
    await expect(page.getByTestId("estimate-total")).toHaveText("₹4,00,000 – ₹21,00,000");
    await expect(page.getByRole("link", { name: "Find Catering" })).toBeVisible();
  });
});

/** Wide tables must scroll inside their own box, never widen the page (mobile-first, H). */
async function expectNoHorizontalOverflow(page: Page, label: string) {
  const { scroll, viewport } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(scroll, `${label} overflows horizontally`).toBeLessThanOrEqual(viewport);
}

test.describe("layout", () => {
  test("public pages fit the screen (no sideways scrolling)", async ({ page }) => {
    for (const path of [
      "/",
      "/search",
      "/listings/sample-royal-palace-grand-hall",
      "/muhurtham",
      "/budget-estimator?city=bengaluru&guests=500&c=venues&c=catering",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page, path);
    }
  });
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Eventzo2027");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("admin price ranges", () => {
  test.describe.configure({ mode: "serial" });

  // Categories with no seeded range. Each project/repeat uses its own one, because
  // a category+city pair is unique and parallel runs would otherwise collide.
  const FREE_CATEGORIES = [
    { slug: "gifts", label: "Gifts & Return Gifts" },
    { slug: "transport", label: "Transport" },
    { slug: "attire", label: "Attire & Jewellery" },
    { slug: "invitations", label: "Invitations" },
    { slug: "rentals", label: "Rentals & Equipment" },
    { slug: "planning", label: "Event Planning" },
    { slug: "cakes-sweets", label: "Cakes & Sweets" },
    { slug: "priests-rituals", label: "Priests & Rituals" },
  ];

  test("an admin adds a range that the public estimator uses, then deletes it", async ({ page }, testInfo) => {
    const category =
      FREE_CATEGORIES[
        ((testInfo.project.name === "mobile" ? 4 : 0) + testInfo.repeatEachIndex) % FREE_CATEGORIES.length
      ];
    const rowName = new RegExp(category.label); // labels contain no regex metacharacters
    await login(page, "admin@sample.eventzo.test");
    await page.goto("/admin/pricing");
    await expect(page.getByRole("heading", { level: 1, name: "Estimator price ranges" })).toBeVisible();

    const form = page.getByRole("form", { name: "Add a price range" });
    await form.getByLabel("Category").selectOption({ label: category.label });
    await form.getByLabel("City").selectOption({ label: "Kalaburagi" });
    await form.getByLabel("Unit").selectOption("per_guest");
    await form.getByLabel("Low (₹)").fill("100");
    await form.getByLabel("High (₹)").fill("50");
    await form.getByRole("button", { name: "Save range" }).click();
    await expect(form.getByText("High must be greater than or equal to low.")).toBeVisible();

    await form.getByLabel("High (₹)").fill("300");
    await form.getByLabel("Publish (visible in the estimator)").check();
    await form.getByRole("button", { name: "Save range" }).click();
    await expect(page.getByText("Price range saved.")).toBeVisible();

    const row = page.getByRole("row", { name: rowName });
    await expect(row).toContainText("Kalaburagi");

    // The public estimator picks it up (cache tag refreshed by the action).
    await page.goto(`/budget-estimator?city=kalaburagi&guests=200&c=${category.slug}`);
    await expect(page.getByTestId("estimate-total")).toHaveText("₹20,000 – ₹60,000");

    // Clean up so the test can run again.
    await page.goto("/admin/pricing");
    await page.getByRole("row", { name: rowName }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Price range deleted.")).toBeVisible();
    await expect(page.getByRole("row", { name: rowName })).toHaveCount(0);
  });

  test("admin editors fit the screen (no sideways scrolling)", async ({ page }) => {
    await login(page, "admin@sample.eventzo.test");
    for (const path of ["/admin/pricing", "/admin/muhurtham", "/admin"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page, path);
    }
  });

  test("a customer cannot open the admin price editor", async ({ page }) => {
    await login(page, "customer@sample.eventzo.test");
    await page.goto("/admin/pricing");
    await expect(page.getByTestId("access-denied")).toBeVisible();
  });
});
