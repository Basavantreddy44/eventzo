import { expect, test, type Page } from "@playwright/test";

/**
 * Roadmap Phase C batch 1: a published hall gets its calendar automatically
 * (V2), "request changes" → vendor sees the reason and resubmits (S4/V11),
 * leads with stage and follow-up (V8), and the score card (V9).
 */

const PASSWORD = "Mantapa2027";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const unique = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function register(page: Page, name: string) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(`${unique("e2e-ve")}@example.test`);
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

test("V2 + S4/V11: the hall's calendar works at once; Eventzo asks for a change and the vendor resubmits", async ({
  browser,
}) => {
  test.slow();
  const vendor = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  await register(vendor, "Changes Owner");
  const business = unique("Changes Mantapa");
  await vendor.goto("/become-a-vendor");
  await vendor.getByLabel("Business name").fill(business);
  await vendor.getByLabel("Primary category").selectOption({ label: "Venues" });
  await vendor.getByLabel("City", { exact: true }).selectOption({ label: "Kalaburagi, Karnataka" });
  await vendor.getByLabel(/I agree to the Vendor Agreement/).check();
  await vendor.getByRole("button", { name: "Create business workspace" }).click();
  await expect(vendor).toHaveURL(/\/vendor$/);

  // Publish a hall: its calendar exists without visiting Resources.
  const title = unique("Auto Hall");
  await vendor.goto("/vendor/listings/new");
  const form = vendor.getByRole("form", { name: "New listing" });
  await form.getByLabel("Category", { exact: true }).selectOption({ label: "Kalyana Mantapa" });
  await form.getByLabel("Listing title").fill(title);
  await form.getByLabel("Per").selectOption("per_day");
  await form.getByLabel("Price (₹)").fill("1,00,000");
  await form.getByLabel("Seated capacity").fill("400");
  await form.getByRole("button", { name: "Save listing" }).click();
  await expect(vendor).toHaveURL(/\/vendor\/listings\/[0-9a-f-]{36}$/);
  await vendor.getByTestId("listing-published").click();
  await expect(vendor.getByText("Listing status updated.")).toBeVisible();
  await vendor.goto("/vendor/resources");
  await expect(vendor.getByRole("row").filter({ hasText: title })).toBeVisible();
  await expect(vendor.getByRole("link", { name: "Advanced: resources" }).first()).toBeVisible();

  // Upload a document → under review.
  await vendor.goto("/vendor/documents");
  await vendor.getByLabel("Document type").selectOption("gst_certificate");
  await vendor
    .getByLabel("File", { exact: true })
    .setInputFiles({ name: "gst.pdf", mimeType: "application/pdf", buffer: PDF });
  await vendor.getByRole("button", { name: "Upload document" }).click();
  await expect(vendor.getByText("Document uploaded.")).toBeVisible();
  await vendor.goto("/vendor");
  await expect(vendor.getByTestId("verification-banner")).toContainText("Eventzo is checking your documents");

  // The admin asks for a change.
  await login(admin, "admin@sample.eventzo.test");
  await admin.goto("/admin/verification");
  await admin
    .getByRole("row", { name: new RegExp(business) })
    .getByRole("link", { name: "Review" })
    .click();
  await admin.getByRole("textbox", { name: "Reason" }).last().fill("Please upload a clearer GST certificate");
  await admin.getByTestId("request-changes").click();
  await expect(admin).toHaveURL(/\/admin\/verification$/);

  // The vendor sees why, and sends it back for review.
  await vendor.reload();
  const banner = vendor.getByTestId("verification-banner");
  await expect(banner).toHaveAttribute("data-state", "changes_requested");
  await expect(banner.getByTestId("verification-note")).toContainText("Please upload a clearer GST certificate");
  await expect(banner.getByRole("link", { name: "Fix" })).toBeVisible();
  await banner.getByTestId("resubmit-verification").click();
  await expect(vendor.getByText("Sent for review. We'll let you know.")).toBeVisible();
  await expect(vendor.getByTestId("verification-banner")).toHaveAttribute("data-state", "pending");

  // The history keeps the request.
  await admin.goto("/admin/verification");
  await admin
    .getByRole("row", { name: new RegExp(business) })
    .getByRole("link", { name: "Review" })
    .click();
  await expect(admin.getByTestId("verification-history")).toContainText("requested changes");
  await expect(admin.getByTestId("verification-history")).toContainText("Please upload a clearer GST certificate");
});

test("V8 + V9: leads show their stage and a follow-up; the score card counts quotes", async ({ browser }) => {
  test.slow();
  const customer = await (await browser.newContext()).newPage();
  const vendor = await (await browser.newContext()).newPage();
  await register(customer, "Lead Customer");
  await login(vendor, "vendor.kalaburagi@sample.eventzo.test");

  await customer.goto("/listings/sample-lakshmi-main-hall");
  await customer.waitForLoadState("networkidle");
  const panel = customer.getByTestId("enquiry-panel");
  const availability = customer.getByTestId("availability");
  for (let attempt = 0; ; attempt++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 60 + Math.floor(Math.random() * 600));
    await panel.getByLabel("Event date").fill(d.toISOString().slice(0, 10));
    await expect(availability).not.toContainText("Checking");
    await expect(availability).toContainText(/Available|Not available/);
    if (!(await availability.textContent())?.includes("Not available")) break;
    if (attempt === 4) throw new Error("No free date found");
  }
  await panel.getByRole("button", { name: "Send enquiry" }).click();
  await expect(customer).toHaveURL(/\/account\/enquiries\/[0-9a-f-]{36}$/);
  const enquiryId = new URL(customer.url()).pathname.split("/").pop()!;

  const row = () =>
    vendor.getByRole("row").filter({ has: vendor.locator(`a[href$="/vendor/enquiries/${enquiryId}"]`) });
  await vendor.goto("/vendor/enquiries");
  await expect(row().getByTestId("lead-stage")).toContainText("New");
  await expect(row()).toContainText("Lead");

  await vendor.goto(`/vendor/enquiries/${enquiryId}`);
  await vendor.getByRole("form", { name: "Send a quotation" }).getByRole("button", { name: "Send quotation" }).click();
  await expect(vendor.getByText("Quotation sent.")).toBeVisible();
  const followUp = vendor.getByTestId("follow-up-form");
  const tomorrow = new Date(Date.now() + 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);
  await followUp.getByLabel("Remind me on").fill(tomorrow);
  await followUp.getByLabel("Note").fill("Call about the menu");
  await followUp.getByRole("button", { name: "Set reminder" }).click();
  await expect(vendor.getByText("Reminder set.")).toBeVisible();

  await vendor.goto("/vendor/enquiries");
  await expect(row().getByTestId("lead-stage")).toContainText("Quoted");
  await expect(row().getByTestId("lead-follow-up")).toBeVisible();

  await vendor.goto("/vendor");
  const card = vendor.getByTestId("scorecard");
  await expect(card.getByTestId("score-response")).toBeVisible();
  await expect(card.getByTestId("score-conversion")).toContainText(/booked of \d+ quoted/);
  await expect(card.getByTestId("score-rating")).toBeVisible();
  await expect(card.getByTestId("score-cancellations")).toBeVisible();
});
