import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 acceptance: vendor onboarding → listing → automatic go-live,
 * photos, KYC upload → staff verification, team invitations, permissions.
 * Each test creates fresh users so it can run repeatedly against the local stack.
 */

const PASSWORD = "Mantapa2027";
// 1×1 PNG and a minimal PDF, generated in memory (no fixtures on disk).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

const unique = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function register(page: Page, name: string) {
  const email = `${unique("e2e-vendor")}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function logout(page: Page) {
  await page.context().clearCookies();
}

async function createVendor(page: Page, businessName: string) {
  await page.goto("/become-a-vendor");
  await page.getByLabel("Business name").fill(businessName);
  await page.getByLabel("Primary category").selectOption({ label: "Venues" });
  await page.getByLabel("City", { exact: true }).selectOption({ label: "Kalaburagi, Karnataka" });
  await page.getByRole("button", { name: "Create business workspace" }).click();
  await expect(page).toHaveURL(/\/vendor$/);
}

async function createPublishedListing(page: Page, title: string) {
  await page.goto("/vendor/listings/new");
  const form = page.getByRole("form", { name: "New listing" });
  await form.getByLabel("Category", { exact: true }).selectOption({ label: "Kalyana Mantapa" });
  await expect(page.getByTestId("venue-section")).toBeVisible();
  await form.getByLabel("Listing title").fill(title);
  await form.getByLabel("Per").selectOption("per_day");
  await form.getByLabel("Price (₹)").fill("1,20,000");
  await form.getByLabel("Seated capacity").fill("600");
  await form.getByRole("button", { name: "Save listing" }).click();
  await expect(page).toHaveURL(/\/vendor\/listings\/[0-9a-f-]{36}$/);
  await page.getByTestId("listing-published").click();
  await expect(page.getByText("Listing status updated.")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("a new vendor goes live automatically once profile and listing are complete", async ({ page }) => {
  await register(page, "Go Live Owner");
  const business = unique("Golive Mantapa");
  await createVendor(page, business);
  await expect(page.getByTestId("golive-card")).toContainText("Your business isn't live yet");

  const title = unique("Golive Hall");
  await createPublishedListing(page, title);

  // Published, but the vendor is still a draft → not public yet.
  await page.goto(`/search?q=${encodeURIComponent(title)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);

  // Completing the profile triggers go-live in the database.
  await page.goto("/vendor/profile");
  await page.getByLabel("About your business").fill("A family-run kalyana mantapa for weddings.");
  await page.getByLabel("Business phone").fill("98450 12345");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();

  await page.goto("/vendor");
  await expect(page.getByTestId("golive-card")).toContainText("Your business is live");

  await page.goto(`/search?q=${encodeURIComponent(title)}`);
  await expect(page.getByTestId("search-results").getByRole("link", { name: title })).toBeVisible();
});

test("photos: upload, cover badge, shown on the public page", async ({ page }) => {
  await register(page, "Photo Owner");
  await createVendor(page, unique("Photo Mantapa"));
  const title = unique("Photo Hall");
  await createPublishedListing(page, title);

  await page.getByTestId("photo-input").setInputFiles([
    { name: "hall.png", mimeType: "image/png", buffer: PNG },
    { name: "stage.png", mimeType: "image/png", buffer: PNG },
  ]);
  await expect(page.getByText("Photos added.")).toBeVisible();
  const photos = page.getByTestId("listing-photos").locator("li");
  await expect(photos).toHaveCount(2);
  await expect(photos.first()).toContainText("Cover");

  await photos.nth(1).getByRole("button", { name: "Make cover" }).click();
  await expect(photos.nth(1)).toContainText("Cover");
  await expect(photos.first()).not.toContainText("Cover");
});

test("KYC: owner uploads a document, staff verify, the vendor shows Verified", async ({ page }) => {
  await register(page, "Kyc Owner");
  const business = unique("Kyc Mantapa");
  await createVendor(page, business);

  await page.goto("/vendor/documents");
  await page.getByLabel("Document type").selectOption("gst_certificate");
  await page
    .getByLabel("File", { exact: true })
    .setInputFiles({ name: "gst.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByText("Document uploaded.")).toBeVisible();
  await expect(page.getByRole("row", { name: /GST certificate/ })).toContainText("Uploaded");
  await expect(page.getByText("Verification status")).toBeVisible();

  await logout(page);
  await login(page, "admin@sample.eventzo.test", "Eventzo2027");
  await page.goto("/admin/verification");
  await page
    .getByRole("row", { name: new RegExp(business) })
    .getByRole("link", { name: "Review" })
    .click();

  // Verifying before approving any document is refused.
  await page.getByTestId("verify-vendor").click();
  await expect(page.getByText("Approve at least one document first.")).toBeVisible();

  await page.getByTestId("review-documents").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Document approved.")).toBeVisible();
  await page.getByTestId("verify-vendor").click();
  await expect(page).toHaveURL(/\/admin\/verification$/);
  await expect(page.getByRole("row", { name: new RegExp(business) })).toHaveCount(0);
});

test("team: owner invites an existing user, who accepts and gets limited access", async ({ browser }) => {
  const ownerPage = await (await browser.newContext()).newPage();
  const staffPage = await (await browser.newContext()).newPage();

  const staffEmail = await register(staffPage, "Invited Staff");
  await register(ownerPage, "Team Owner");
  const business = unique("Team Mantapa");
  await createVendor(ownerPage, business);

  await ownerPage.goto("/vendor/team");
  const invite = ownerPage.getByRole("form", { name: "Invite a team member" });
  await invite.getByLabel("Email", { exact: true }).fill(staffEmail);
  await invite.getByLabel("Role", { exact: true }).selectOption("staff");
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(ownerPage.getByText("already has an Eventzo account")).toBeVisible();
  await expect(ownerPage.getByRole("row", { name: new RegExp(staffEmail) })).toBeVisible();

  // Duplicate invitations are refused.
  await invite.getByLabel("Email", { exact: true }).fill(staffEmail);
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(invite.getByText("There is already a pending invitation for this email.")).toBeVisible();

  await staffPage.goto("/account");
  const card = staffPage.getByTestId("invitations");
  await expect(card).toContainText(business);
  await card.getByRole("button", { name: "Accept" }).click();
  await expect(staffPage).toHaveURL(/\/vendor$/);

  // Staff can see the team, but not invite or edit the profile.
  await staffPage.goto("/vendor/team");
  await expect(staffPage.getByRole("cell", { name: /Invited Staff/ })).toBeVisible();
  await expect(staffPage.getByRole("form", { name: "Invite a team member" })).toHaveCount(0);
  await staffPage.goto("/vendor/profile");
  await expect(staffPage.getByText("Only the business owner can change this.")).toBeVisible();
  await expect(staffPage.getByRole("button", { name: "Save profile" })).toHaveCount(0);
  await staffPage.goto("/vendor/documents");
  await expect(staffPage.getByText("Only the business owner can change this.")).toBeVisible();
});

test("team: inviting a new email sends an invitation email", async ({ page }) => {
  await register(page, "Mail Owner");
  await createVendor(page, unique("Mail Mantapa"));
  await page.goto("/vendor/team");
  const invite = page.getByRole("form", { name: "Invite a team member" });
  const email = `${unique("e2e-newstaff")}@example.test`;
  await invite.getByLabel("Email", { exact: true }).fill(email);
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invitation emailed to ${email}.`)).toBeVisible();
});

test("branches and resources", async ({ page }) => {
  await register(page, "Ops Owner");
  await createVendor(page, unique("Ops Mantapa"));

  await page.goto("/vendor/branches");
  const branch = page.getByRole("form", { name: "Add a branch" });
  await branch.getByLabel("Branch name").fill("Jewargi Road Branch");
  await branch.getByLabel("City", { exact: true }).selectOption({ label: "Kalaburagi" });
  await branch.getByLabel("PIN code").fill("12");
  await branch.getByRole("button", { name: "Save branch" }).click();
  await expect(branch.getByText("Enter a 6-digit PIN code.")).toBeVisible();
  await branch.getByLabel("PIN code").fill("585102");
  await branch.getByRole("button", { name: "Save branch" }).click();
  await expect(page.getByText("Branch saved.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Jewargi Road Branch/ })).toBeVisible();

  await page.goto("/vendor/resources");
  const res = page.getByRole("form", { name: "Add a resource" });
  await res.getByLabel("Name", { exact: true }).fill("Chairs");
  await res.getByLabel("Type").selectOption("equipment");
  await res.getByLabel("Booking style").selectOption("capacity");
  await res.getByLabel("Capacity").fill("300");
  await res.getByLabel("Breakdown buffer (min)").fill("60");
  await res.getByRole("button", { name: "Save resource" }).click();
  await expect(page.getByText("Resource saved.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Chairs/ })).toContainText("300");
});

test("vendor pages fit a phone screen", async ({ page }) => {
  await register(page, "Mobile Owner");
  await createVendor(page, unique("Mobile Mantapa"));
  for (const path of [
    "/vendor",
    "/vendor/listings/new",
    "/vendor/profile",
    "/vendor/documents",
    "/vendor/branches",
    "/vendor/resources",
    "/vendor/team",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const { scroll, viewport } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(scroll, `${path} overflows horizontally`).toBeLessThanOrEqual(viewport);
  }
});
