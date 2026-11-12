import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 6 acceptance (run with NOTIFICATIONS_SIMULATOR=true):
 * event workspace → guests (single + pasted list) → private RSVP link answered
 * without logging in → host notified (bell + list) → co-host invited, joins,
 * adds a guest and follows the vendor conversation; viewer-only limits;
 * enquiry filed under the event; budget line; WhatsApp opt-in needs a phone;
 * operator outbox; cron endpoint refuses unconfigured calls.
 */

const PASSWORD = "Mantapa2027";
const MAIN_HALL = "/listings/sample-lakshmi-main-hall";

function futureDate(minDays: number, spread: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + minDays + Math.floor(Math.random() * spread));
  return d.toISOString().slice(0, 10);
}

async function register(page: Page, name: string) {
  const email = `e2e-ev-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

async function createEvent(page: Page, title: string) {
  await page.goto("/account/events");
  const form = page.getByRole("form", { name: "New event" });
  await form.getByLabel("Event name").fill(title);
  await form.getByLabel("Type of event").selectOption("wedding");
  await form.getByLabel("City").selectOption({ label: "Kalaburagi" });
  await form.getByLabel("Date").fill(futureDate(90, 300));
  await form.getByLabel("Expected guests").fill("300");
  await form.getByTestId("create-event").click();
  await expect(page).toHaveURL(/\/account\/events\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  return new URL(page.url()).pathname.split("/").pop()!;
}

test("guests RSVP from a private link and the hosts are notified", async ({ browser }) => {
  test.slow();
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const host = await ctx.newPage();
  await register(host, "Meera Host");
  const title = `Meera weds Arjun ${Date.now()}`;
  const eventId = await createEvent(host, title);

  // Guests: one by one, then a pasted list.
  await host.getByTestId("tab-guests").click();
  const add = host.getByRole("form", { name: "Add a guest" });
  await add.getByLabel("Name").fill("Kamala Aunty");
  await add.getByLabel("Mobile (for WhatsApp)").fill("98450 12345");
  await add.getByLabel("People").fill("2");
  await add.getByTestId("add-guest").click();
  await expect(host.getByTestId("guest-row").filter({ hasText: "Kamala Aunty" })).toBeVisible();

  const bulk = host.getByRole("form", { name: "Paste a list" });
  await bulk.getByLabel("One guest per line").fill("Suresh Kulkarni, 3\nAnita, 98450 54321");
  await bulk.getByRole("button", { name: "Add all" }).click();
  await expect(host.getByText("2 guests added")).toBeVisible();
  await expect(host.getByTestId("summary-guests")).toHaveText("3");
  await expect(host.getByTestId("summary-invitedPeople")).toHaveText("6");

  // Bad paste lines are reported, nothing is added.
  await bulk.getByLabel("One guest per line").fill("Fine guest\nBroken, 12-34");
  await bulk.getByRole("button", { name: "Add all" }).click();
  await expect(bulk.getByRole("alert")).toContainText("Some lines couldn't be read");
  await expect(host.getByTestId("summary-guests")).toHaveText("3");

  // Copy Kamala's private link.
  const kamala = host.getByRole("row").filter({ hasText: "Kamala Aunty" });
  await kamala.getByTestId("guest-copy-link").click();
  await expect(host.getByText("Invitation link copied")).toBeVisible();
  const link = await host.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{32}$/);
  await expect(kamala).not.toContainText("Link not shared yet");

  // The guest opens it without an account.
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByTestId("invitation-title")).toHaveText(title);
  await expect(guest.getByText("Dear Kamala Aunty,")).toBeVisible();
  await guest.getByTestId("rsvp-attending").check();
  await guest.getByLabel("How many people (up to 2)?").fill("3");
  await guest.getByTestId("rsvp-submit").click();
  await expect(guest.getByRole("alert").filter({ hasText: "Check the number of people" })).toBeVisible();
  await guest.getByLabel("How many people (up to 2)?").fill("2");
  await guest.getByLabel(/Message to the hosts/).fill("Coming with my husband");
  await guest.getByTestId("rsvp-submit").click();
  await expect(guest.getByTestId("rsvp-done")).toBeVisible();

  // An unknown link shows not-found.
  await guest.goto("/invite/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  await expect(guest.getByRole("heading", { name: "Page not found" })).toBeVisible();

  // The host sees the reply, and a notification.
  await host.reload();
  await expect(host.getByTestId("summary-attending")).toHaveText("2");
  await expect(kamala).toContainText("Attending");
  await expect(kamala).toContainText("Coming with my husband");
  await expect(host.getByTestId("notification-count")).toBeVisible();
  await host.getByTestId("notification-bell").click();
  await expect(host).toHaveURL(/\/account\/notifications$/);
  await expect(host.getByTestId("notifications")).toContainText(`Kamala Aunty replied “Attending” for ${title}`);
  await host.getByTestId("mark-all-read").click();
  await expect(host.getByTestId("notification-count")).toHaveCount(0);

  // Regenerating the link revokes the old one.
  await host.goto(`/account/events/${eventId}?tab=guests`);
  await host.getByRole("row").filter({ hasText: "Kamala Aunty" }).getByRole("button", { name: "New link" }).click();
  await host.getByRole("alertdialog").getByRole("button", { name: "New link" }).click();
  await expect(host.getByText("New link ready")).toBeVisible();
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByRole("heading", { name: "Page not found" })).toBeVisible();

  // Budget: a custom line.
  await host.getByTestId("tab-budget").click();
  const line = host.getByRole("form", { name: "Plan a category" });
  await line.getByLabel("Category").selectOption({ label: "Other (name it)" });
  await line.getByLabel("Name").fill("Jewellery");
  await line.getByLabel("Planned (₹)").fill("1,50,000");
  await line.getByRole("button", { name: "Add to budget" }).click();
  await expect(host.getByTestId("budget-planned")).toHaveText("₹1,50,000");
  await expect(host.getByRole("row").filter({ hasText: "Jewellery" })).toBeVisible();
});

test("a co-host joins, helps with guests and the vendor conversation; viewers only look", async ({ browser }) => {
  test.slow();
  const owner = await (await browser.newContext()).newPage();
  const cohost = await (await browser.newContext()).newPage();
  const viewer = await (await browser.newContext()).newPage();
  const cohostEmail = await register(cohost, "Ravi Cohost");
  const viewerEmail = await register(viewer, "Sita Viewer");
  await register(owner, "Owner Family");
  const title = `Naming ceremony ${Date.now()}`;
  const eventId = await createEvent(owner, title);

  // Invite both.
  await owner.getByTestId("tab-people").click();
  const invite = owner.getByRole("form", { name: "Invite someone" });
  await invite.getByLabel("Email").fill(cohostEmail);
  await invite.getByLabel("Role").selectOption("cohost");
  await invite.getByTestId("invite-member").click();
  await expect(owner.getByText("Invitation sent")).toBeVisible();
  await invite.getByLabel("Email").fill(viewerEmail);
  await invite.getByLabel("Role").selectOption("viewer");
  await invite.getByTestId("invite-member").click();
  await expect(owner.getByTestId("pending-invitations")).toContainText(viewerEmail);

  // File a vendor enquiry under the event.
  await owner.goto(MAIN_HALL);
  await owner.waitForLoadState("networkidle");
  const panel = owner.getByTestId("enquiry-panel");
  const availability = owner.getByTestId("availability");
  for (let attempt = 0; ; attempt++) {
    await panel.getByLabel("Event date").fill(futureDate(60, 600));
    await expect(availability).not.toContainText("Checking");
    await expect(availability).toContainText(/Available|Not available/);
    if (!(await availability.textContent())?.includes("Not available")) break;
    if (attempt === 4) throw new Error("No free date found in 5 tries");
  }
  await panel.getByRole("button", { name: "Send enquiry" }).click();
  await expect(owner).toHaveURL(/\/account\/enquiries\/[0-9a-f-]{36}$/);
  await owner.getByTestId("enquiry-event-select").selectOption({ label: title });
  await owner.getByTestId("enquiry-event").getByRole("button", { name: "Save" }).click();
  await expect(owner.getByTestId("enquiry-event").getByRole("link", { name: "Open the event" })).toBeVisible();

  // The co-host accepts and gets to work.
  await cohost.goto("/account/events");
  await expect(cohost.getByTestId("event-invitations")).toContainText(title);
  await cohost.getByTestId("accept-event-invitation").click();
  await expect(cohost.getByTestId("event-card").filter({ hasText: title })).toContainText("Co-host");
  await cohost.goto(`/account/events/${eventId}`);
  const vendorRow = cohost.getByRole("row").filter({ hasText: "Sample Lakshmi Kalyana Mantapa – Main Hall" });
  await expect(vendorRow).toBeVisible();
  await vendorRow.getByRole("link", { name: "Open" }).click();
  await expect(cohost).toHaveURL(/\/account\/enquiries\//);
  await expect(cohost.getByTestId("cohost-note")).toBeVisible();
  await expect(cohost.getByRole("button", { name: "Cancel enquiry" })).toHaveCount(0);
  await cohost.getByLabel("Write a message…").fill("Co-host here: can we visit on Sunday?");
  await cohost.getByRole("button", { name: "Send", exact: true }).click();
  await expect(cohost.getByText("Co-host here: can we visit on Sunday?")).toBeVisible();

  await cohost.goto(`/account/events/${eventId}?tab=guests`);
  const add = cohost.getByRole("form", { name: "Add a guest" });
  await add.getByLabel("Name").fill("Cousin Prakash");
  await add.getByTestId("add-guest").click();
  await expect(cohost.getByTestId("guest-row").filter({ hasText: "Cousin Prakash" })).toBeVisible();

  // The viewer can look but not change anything.
  await viewer.goto("/account/events");
  await viewer.getByTestId("accept-event-invitation").click();
  await expect(viewer.getByTestId("event-card").filter({ hasText: title })).toContainText("Viewer");
  await viewer.goto(`/account/events/${eventId}?tab=guests`);
  await expect(viewer.getByTestId("guest-row").filter({ hasText: "Cousin Prakash" })).toBeVisible();
  await expect(viewer.getByRole("form", { name: "Add a guest" })).toHaveCount(0);
  await expect(viewer.getByTestId("guest-copy-link")).toHaveCount(0);
  await viewer.goto(`/account/events/${eventId}`);
  await expect(viewer.getByRole("row").filter({ hasText: "Main Hall" }).getByRole("link")).toHaveCount(0);

  // Members list; the owner sees everyone, an outsider sees nothing.
  await owner.goto(`/account/events/${eventId}?tab=people`);
  await expect(owner.getByTestId("member-row")).toHaveCount(3);
  const outsider = await (await browser.newContext()).newPage();
  await register(outsider, "Eve Outsider");
  await outsider.goto(`/account/events/${eventId}`);
  await expect(outsider.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(outsider.getByText(title)).toHaveCount(0);
});

test("WhatsApp opt-in needs a mobile number; operators see the outbox; cron is locked", async ({
  browser,
  request,
}) => {
  const user = await (await browser.newContext()).newPage();
  await register(user, "Opt In");
  await user.goto("/account/notifications");
  await expect(user.getByTestId("whatsapp-needs-phone")).toBeVisible();
  await expect(user.getByTestId("pref-whatsapp-bookings")).toBeDisabled();
  await expect(user.getByTestId("pref-email-messages")).not.toBeChecked();

  await user.goto("/account");
  const mobile = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  await user.getByLabel("Mobile number").fill(mobile);
  await user.getByRole("button", { name: "Save changes" }).click();
  await expect(user.getByText("Profile saved.")).toBeVisible();
  await user.goto("/account/notifications");
  await user.waitForLoadState("networkidle"); // hydrated before clicking
  await user.getByTestId("whatsapp-toggle").click();
  await expect(user.getByText("WhatsApp updates turned on")).toBeVisible();
  await expect(user.getByTestId("whatsapp-state")).toContainText(`On: updates go to +91${mobile}`);
  await expect(user.getByTestId("pref-whatsapp-bookings")).toBeChecked();

  // Customers can't open the operator outbox.
  await user.goto("/admin/notifications");
  await expect(user.getByTestId("access-denied")).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await admin.goto("/login");
  await admin.getByLabel("Email", { exact: true }).fill("admin@sample.eventzo.test");
  await admin.getByLabel("Password", { exact: true }).fill("Eventzo2027");
  await admin.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(admin).toHaveURL(/\/account$/);
  await admin.goto("/admin/notifications");
  await expect(admin.getByTestId("outbox-mode")).toContainText("Simulator on");
  await admin.getByTestId("process-outbox").click();
  await expect(admin.getByText("Queue processed")).toBeVisible();

  const cron = await request.get("/api/cron/notifications");
  expect([401, 503]).toContain(cron.status());
});
