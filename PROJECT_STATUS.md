# Eventzo — Project Status

_Last updated: 12 Nov 2026 (Phases 8 and 9)_

## Current phase: 9 — Hardening: testing, security review, deployment

**Status: ✅ Phases 7, 8 and 9 complete and tested locally (12 Nov 2026). Not pushed to Eventzoo yet**: migrations `20261116000100_vendor_ops.sql` and `20261117000100_admin_ops.sql` wait for your go-ahead (Eventzoo is at 16/18). Nothing is deployed to Vercel yet. `DEPLOYMENT.md` lists what's needed.

What's left belongs to you, not code: the launch decisions and reviews (D7 city, D8 CA, legal texts, translations), keys for Razorpay, WhatsApp and SMTP, and the go-ahead to push and deploy.

Phase 6 (events, RSVP, notifications) is complete and on Eventzoo. WhatsApp and email run on a delivery simulator until a provider is connected.

Phase 5 (booking & payments) is complete and on Eventzoo; online payment runs on the payment simulator until Razorpay keys are added.

| Phase | Status |
|---|---|
| 1 — Foundation | ✅ complete |
| 2 — Customer marketplace & discovery (B display, F estimator) | ✅ complete |
| 3 — Vendor onboarding & ERP core | ✅ complete |
| 4 — Availability, enquiries, quotations (A, G, B pricing) | ✅ complete |
| 5 — Booking & payments (Razorpay test mode) | ✅ complete (simulated gateway until Razorpay keys are added) |
| 6 — Event workspace, messaging, notifications (C, E) | ✅ complete (WhatsApp/email simulated until a provider is connected) |
| 7 — Advanced vendor ERP (staff, resources, finance, reports, H) | ✅ complete (local; push pending) |
| 8 — Admin & platform operations | ✅ complete (local; push pending) |
| 9 — Hardening: testing, security review, deployment | ✅ complete (deployment itself waits for your go-ahead and keys) |

---

## Environments

| Environment | Where | Used for |
|---|---|---|
| **Eventzoo (hosted)** | Supabase project ref `qpjpnmohxkfvwduqvtuy`, ap-southeast-2 (Sydney). Repo is linked. `.env.local` points here | Day-to-day app use and demos |
| Local Docker stack | `npm run db:start`; values in `.env.docker` | Automated tests (E2E refuses to run against hosted) |

- **11 Nov 2026:** all 13 migrations and the DEV seed pushed to Eventzoo (`npx supabase db push --remote --include-seed`).
  - Verified over the public API: 15/74 categories, 2 cities, 8 sample listings searchable, 8 sample muhurtham dates, 12 estimator ranges.
  - Anonymous users are refused raw table access.
  - Buckets `business-documents` (private) and `listing-media` (public) exist; dev logins work.
- **12 Nov 2026 (evening):** Phase 6 migration pushed (16/16 in sync). Verified: anonymous users are refused events, guests, notifications and the outbox; they can open an invitation link (an unknown link shows nothing) but cannot create events or claim the outbox; the dev server serves the new pages. `NOTIFICATIONS_SIMULATOR=true` is set in `.env.local`.
- **12 Nov 2026 (later):** Phase 5 migration pushed (15/15 in sync). Verified: sample listings got the 25% / moderate defaults, the new tables exist, anonymous users are refused bookings and the payment-confirm function, the expiry job runs, and the app pages load. `PAYMENTS_SIMULATOR=true` is set in `.env.local`.
- **12 Nov 2026:** Phase 4 migration pushed (14/14 in sync), plus the 3 sample-venue resources. Verified: listing availability and search via the public API, all 4 dev logins, and app pages served from Eventzoo with no errors.
- **Network note:** some Indian ISPs (e.g. Jio, some Airtel lines) block `supabase.co`. If you see `fetch failed`, use Cloudflare WARP/VPN or another network, or switch to the local stack (`cp .env.docker .env.local`; Eventzoo values are kept in `.env.eventzoo`). Before launch, consider a Supabase custom domain so customers on those ISPs are not affected.
- Not done yet (needs your go-ahead): running the pgTAP suite against Eventzoo (`npx supabase test db --remote --yes`; it runs in rolled-back transactions).
- **Eventzoo contains the DEV seed by your choice** (Sample vendors, dev logins with password `Eventzo2027`). Remove it before real launch, or create a clean production project (ideally Mumbai, ap-south-1) and push migrations only.
- The unrelated **Orbit Social** project in the same Supabase account was never used and must not be.

---

## Phase 9 — completed (hardening)

### Security review
- **Database:**
  - Every `SECURITY DEFINER` function in `public` and `private` pins `search_path` (checked against `pg_proc`).
  - Every public table has RLS (`05_rls_coverage`).
  - Anonymous visitors can call exactly 7 functions, all intentional: listing search and detail, availability, invitation, RSVP, and the two permission helpers that public policies use.
  - `supabase db lint` reports no errors.
- **Dependencies:** `npm audit --omit=dev` reports 0 vulnerabilities.
- **Code:**
  - The service-role client is used only server-side, after its own checks: webhooks, payments, the outbox, invitations and user blocking.
  - No `dangerouslySetInnerHTML`, `eval` or `new Function`.
  - Every portal page re-checks the session, and `.env*` files are git-ignored.
- **New HTTP headers:**
  - **Content-Security-Policy** allows only this site, the configured Supabase origin (HTTPS and WebSocket) and Razorpay; `object-src 'none'`, `frame-ancestors 'none'`, and `unsafe-eval` in development only.
  - **HSTS** is sent when `NEXT_PUBLIC_SITE_URL` is https.
  - These sit alongside the existing `X-Frame-Options`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`.

### Operations
- **`GET /api/health`:** an uptime check that reaches the database with the anon key. It is never cached and returns 503 when the database is unreachable.
- **`robots.txt`** keeps portals, receipts, invitations, auth and the API out of search engines.
- **`sitemap.xml`** lists the public pages and every live listing, with Kannada and Hindi alternates. It refreshes hourly and is invalidated on listing changes.
- **CI** (`.github/workflows/ci.yml`) has two jobs:
  1. format, lint, types, unit tests and PGlite migrations;
  2. a throw-away local Supabase in Docker, then pgTAP, the production build and E2E, with simulators on and never a hosted project.

  It runs on GitHub once the repository is pushed; it hasn't run there yet.
- **`vercel.json`:** a cron job every 5 minutes for the WhatsApp/email outbox. Vercel's Hobby plan allows only daily jobs; see `DEPLOYMENT.md`.
- **`DEPLOYMENT.md`:** Supabase production settings, Vercel environment variables, the go / no-go launch checklist (simulators off, no dev seed, CA, legal, SMTP, WhatsApp templates, translations, backups, monitoring) and operator security notes.
- **Prettier:** `npm run format:check` passes. Hand-formatted docs, CSS token comments and SQL includes are excluded.

## Phase 8 — completed

### Decisions (product owner, 12 Nov 2026)
- **Suspension keeps bookings:** a suspended vendor is hidden and gets no new enquiries; existing bookings and payments continue, and the owner is told why.
- **Blocking sign-in:** allowed with a reason, audited; the person's bookings are untouched.
- **Support:** a read-only support view, each opening audited; no "log in as user".
- **Extra:** a platform payments ledger for finance.

### Database (migration `20261117000100_admin_ops.sql`)
- **Vendors:** `set_organization_status(org, suspend | close | reinstate, reason)` needs `organizations.manage` (super admin).
  - A reason is required to suspend or close, and is kept with who changed it and when.
  - Reinstating returns the vendor to live when the go-live rules still hold, otherwise to draft.
  - The owners are notified (`vendor.suspended` / `closed` / `reinstated`) and the change is audited.
  - Search, listing pages and new enquiries already required an active vendor.
- **Users:** `set_user_block(user, block, reason)` needs the new permission `users.block` (super admin, support).
  - It records the block and deletes the person's sessions, then `my_access()` treats them as signed out everywhere.
  - Nobody can block themselves, and only a super admin can block platform staff.
  - The server action also bans the account in Supabase Auth. If that fails, the database record is undone.
- **Lists and views:**
  - `admin_list_users` and `admin_list_vendors`: search, status filter and paging.
  - `admin_user_overview`: profile, roles, memberships, enquiries, bookings, payments (finance or support only) and recent activity (audit.read only). **Every call writes `support.user_viewed` to the audit log.**
  - `admin_vendor_overview`: listings, enquiries in the last 90 days, bookings and vendor cancellations; money totals only with `finance.read`.
- **Roles:** a trigger stops anyone removing the last super admin.

### App
- **Admin navigation** shows only the pages each role can open; the disabled "coming soon" items are gone. Each page also re-checks its own permission.
- **Vendors** (`/admin/vendors`, `/admin/vendors/<id>`): search and status filter.
  - The detail page shows activity, contact, listings, team and branches.
  - Suspend, close and reinstate, with a reason and confirmation.
  - Links to verification and to the vendor's audit history.
  - The vendor's own portal shows a banner with the reason, saying that bookings continue.
- **Users** (`/admin/users`, `/admin/users/<id>`): search by email, name or phone.
  - The support view shows enquiries, bookings, payments and activity.
  - Block or unblock sign-in, with a reason.
  - Grant or revoke platform roles (super admin only).
  - A blocked person sees "This account has been blocked" at sign-in.
- **Categories & cities** (`/admin/taxonomy`): categories, service types, cities and areas.
  - Add and edit, with Kannada and Hindi names, and the URL name made from the English name.
  - Hide or show; entries are never deleted.
  - Public pages update straight away (cache tag).
- **Audit log** (`/admin/audit`): filter by table, action, record, person, vendor and dates. Shows who did what, with a field-by-field change view, and pages through results.
- **Payments ledger** (`/admin/payments`): every payment across vendors.
  - Filters by status, method, vendor and dates.
  - Totals for paid online, recorded offline and refunded; receipt links; CSV.

## Phase 7 — completed

### Decisions (product owner, 12 Nov 2026)
- **Staff:** a roster anyone can be on (cooks, decorators, helpers). Linking a team member's Eventzo login is optional and gives them the mobile job app.
- **Privacy on jobs:** staff always see the customer's first name, the venue and the instructions. They see the phone only from 2 days before to 1 day after the job, never email or money (apart from their own pay).
- **Finance:** money received, what customers still owe, an expense log (including staff payouts) and printable payment receipts. No GST tax invoices yet (D8, CA review).
- **Staff app (H):** installable, and the last job list stays readable offline. Answers need a connection.

### Database (migration `20261116000100_vendor_ops.sql`)
- **`staff_profiles`:** name, phone, skill, usual day rate and branch, with an optional link to a team login (same business only, one profile per login).
  - The `bookable_resources.staff_profile_id` foreign key arrives here, as planned in Phase 1. An artist or team resource can be one person's own calendar.
- **`jobs`:** one per confirmed booking item or offline booking, created the first time someone is staffed (`ensure_job`). Each holds the venue address and instructions for staff.
  - Cancelling or expiring the booking, or releasing the offline booking, cancels the job and its open assignments. Completed work stays completed.
- **`job_assignments`** (assigned → accepted / declined → checked in → completed, or cancelled) are written only through RPCs.
  - **`assign_staff`** refuses a person who is already on another job at the same time (row lock on the staff member, `23P01`).
  - It also refuses someone from another branch, and a call time outside the day before the job up to its end.
  - When the person has their own artist resource, assigning **reserves it** (D5 "teams: reserve each assigned artist"), so customers can't book them for the same time. Unassigning or declining releases it.
  - The calendar can't release that reservation directly.
  - `update_assignment` and `unassign_staff` belong to managers. `respond_job` belongs to the assigned person: accept and decline; check in from a day before; complete once started; repeated taps are harmless.
- **`my_jobs()`:** the staff job list, served through a function rather than the raw rows (§7).
  - It shows the customer's first name, the venue (job address, else the event's venue, else the hall's branch address) and the instructions.
  - The phone appears only inside the window above.
- **`vendor_expenses`:** 11 categories, payment mode, payee and reference, optionally linked to a booking or job.
  - A staff payout is an expense linked to the assignment (one per assignment) and is categorised automatically.
  - RLS gives owners every expense and branch managers their branches. Expenses are audited.
- **Receipts:**
  - `payments.receipt_number` is assigned when a payment becomes paid, numbered per vendor per Indian financial year (`RCPT-2026-27-0001`, IST). Existing paid payments were backfilled.
  - `payment_receipt()` is open to the customer, the vendor's managers and finance only.
- **`vendor_report()`:** owners and managers only. Branch managers get only their branches: the function applies the same rules as RLS itself, which is faster.
  - It returns the enquiry → quote → booking funnel, booked value, money received, refunded and spent, and what's outstanding.
  - It also breaks results down by month, listing, resource use (booked and blocked days) and staff (jobs, completed, declined, agreed pay, paid out).
- **Notifications:** `job.assigned` and `job.cancelled` go to the staff login; `job.declined` goes to owners and branch managers.
- All new tables have RLS and are audited.

### App
- **Staff** (`/vendor/staff`): roster table, add/edit (login, branch, day rate), deactivate. Says plainly that a linked person can see their own profile.
- **Schedule** (`/vendor/schedule`): confirmed and offline bookings for the next 7 / 14 / 30 / 90 / 365 days, grouped by date, with who's on each job.
  - Each job has assign (role, call time in IST, pay), change, unassign and record payout.
  - Each job also has venue and instructions for staff.
- **Booking page:** the same "Team for this job" card on confirmed bookings, and a **Receipt** link on every paid payment (customer and vendor).
- **My jobs** (`/vendor/jobs`, staff app H): mobile-first cards for today, upcoming and recent jobs.
  - Each card shows the call time, a map link, the customer's first name and phone (when allowed), guests, instructions and the person's own pay.
  - Big buttons answer the job: accept, can't make it (with a reason), I've arrived, mark done.
  - **Installable:** a manifest (`/staff.webmanifest`), icons (`public/icons`, made by `scripts/generate-staff-icons.mjs`) and a service worker (`public/sw.js`).
  - Offline, the service worker shows the last job list, with an "offline, saved at …" banner and disabled buttons.
  - Signing out deletes the saved copy, and a signed-out redirect is never cached.
- **Finance** (`/vendor/finance`), with three tabs:
  - **Overview:** received, refunded, expenses, net cash and still to collect; by month; the list of bookings still owing money.
  - **Expenses:** list, add and delete.
  - **Payments & receipts:** receipt numbers that link to the receipt.
  - Periods are this month, last month, last 90 days, this or last financial year, or a custom range (up to 2 years). Every table downloads as CSV, protected against spreadsheet formula injection.
- **Reports** (`/vendor/reports`): funnel, by listing, resource use with bars, staff and expenses by category, with CSV.
- **Receipts** (`/receipts/<id>`): printable with *Print or save as PDF*. It shows the amount in words (lakh/crore), method, reference, booking total, paid to date and balance. It is marked "not a GST tax invoice", is noindex, and sends no referrer.
- **Resources:** an artist or team resource can be linked to a staff member.
- **Navigation:** *My jobs* for everyone; *Schedule*, *Staff*, *Finance* and *Reports* for owners and managers. Finance was a disabled placeholder before. Staff see "managers only" on those pages.

## Phase 6 — completed

### Decisions (product owner, 12 Nov 2026)
- **Notifications:** real in-app notifications now. WhatsApp opt-in and consent are recorded, and WhatsApp/email messages are queued in an outbox. A provider plugs in later; until then a simulator can mark them sent (like the payment simulator).
- **RSVP:** each guest gets a private, unguessable link. They answer without an account. The host can make a new link, which revokes the old one.
- **Collaborators:** **co-hosts** edit guests and budget and can message vendors; **viewers** only look. Only the event owner books, pays or cancels. Invitations go by email to an Eventzo account.
- **Workspace scope:** vendors grouped per event, guests & RSVP, family & helpers, and the **event budget (F)**. Checklists, a day-of schedule and a unified inbox were not chosen.

### Database (migration `20261115000100_events_notifications.sql`)
- **`events`** (owner, type, city, dates up to 30 days long, expected guests, invitation-card text), **`event_members`** (owner / cohost / viewer, one owner) and **`event_invitations`**. The audit log records all three.
- **`event_guests`**: party size, RSVP status, headcount and note.
  - `invite_token` (32 random characters) can't be selected from the table. Editors get it through `guest_invite_token()`.
  - Each event has at most 2,000 guests.
- **`event_budget_lines`**: planned amount per business category, or a line you name yourself (e.g. Jewellery).
- **Links:** `enquiries.event_id` and `bookings.event_id`. `set_enquiry_event()` lets an owner file only their own enquiries under their own events, so the person who pays is always the owner.
- **RLS:**
  - Members read the event, its guests and its budget.
  - Owners and co-hosts edit guests and budget (column grants).
  - Co-hosts can read the event's enquiry threads and quotes and write to the vendor (on the customer's side). Viewers can't.
  - Only the owner manages members and status.
- **Event RPCs:** `create_event` (idempotent), `set_event_status`, `invite_event_member`, `respond_event_invitation`, `revoke_event_invitation`, `my_event_invitations`, `event_member_directory` (emails shown to the owner only), `remove_event_member` (also used to leave), `event_vendors` (vendor, status, total, paid and refunded for each enquiry of the event), `mark_guests_invited`.
- **Public RSVP:** `invitation_by_token` and `respond_rsvp`, granted to anon.
  - The headcount is limited by the party size.
  - RSVP closes after the last event day or when the event isn't planning.
  - A cancelled event's links stop working.
- **Notifications:**
  - **`notifications`** (own rows only; on Supabase Realtime for the live bell) and **`notification_outbox`** (WhatsApp/email; staff with `notifications.manage` only: super admin and support).
  - Triggers on enquiries, quotes, messages, booking items, payments and refunds create notifications for 17 kinds of event. Recipients are the customer (plus co-hosts for vendor messages), the vendor's owners and the branch managers of that branch, and event editors for RSVPs.
  - `private.notify()` never raises, so a notification problem can't undo a booking or payment.
- **WhatsApp consent:** `set_whatsapp_consent()` appends to `consent_records` and needs a mobile number. A message is queued only with a current opt-in, a phone number, and the category switched on.
- **Delivery:** `claim_outbox` and `complete_outbox` (service role only; retries with backoff, failed after 5 attempts).

### App
- **/account/events:** event list, invitations to join, and a new-event form.
- **/account/events/[id]** has four tabs:
  - **Overview:** vendors, guests and budget at a glance; the vendor list (each booking stays independent); event and invitation-card details.
  - **Guests & RSVP:** add one guest or paste a list; per guest *WhatsApp* (opens a wa.me chat with the private link ready, no provider needed), *Copy link*, *New link*, record a reply taken by phone, and remove.
  - **Budget:** planned, booked, paid and remaining (overspend shown), per-category lines, your own lines, and *Fill from estimate* (midpoint of the city's published range × expected guests).
  - **Family & helpers:** members, invite (co-host / viewer), withdraw, remove or leave.
- **/invite/[token]** (public, noindex, no referrer): the invitation card and the RSVP form.
- **Enquiry page:** a "Part of event" picker for the owner. Co-hosts see a note and the message box, but no accept, book or cancel buttons.
- **Notifications:**
  - A **bell** with an unread count in every portal header, live through Realtime.
  - **/account/notifications:** list, mark all read, WhatsApp on/off, and an in-app / WhatsApp / email switch for each category.
  - **/admin/notifications** (outbox) shows queued, sent and failed messages (addresses masked), the WhatsApp template names, and *Send queued now*.
  - `GET/POST /api/cron/notifications` needs `Authorization: Bearer $CRON_SECRET`. It returns 503 until a secret and a delivery mode are configured.
- **WhatsApp template registry** (`src/features/notifications/lib/templates.ts`): the 17 template names and the order of their variables, ready to submit to Meta for approval.
- **Account page:** "My events" now shows your upcoming events.

## Phase 5 — completed

### Decisions (product owner, 12 Nov 2026)
- **Advance:** each listing sets its own advance % (10–100, default 25). It is snapshotted onto the booking.
- **Balance:** paid online, or recorded by the vendor as received offline (cash / UPI / bank transfer / cheque).
- **Payment window:** the advance must be paid within the 48-hour hold; otherwise the booking expires and the date is released.
- **Cancellations:** each listing picks a policy. Refunds are computed automatically and issued manually: finance for online money, the vendor for money they received. No escrow or automatic payouts (D8).

### Database (migration `20261114000100_bookings_payments.sql`)
- **Listing terms:** `services.advance_bps` and `services.cancellation_policy`.
  - flexible: 100% refund ≥ 7 days before, 50% ≥ 1 day, else 0.
  - moderate: 100% ≥ 30 days, 50% ≥ 7 days, else 0.
  - strict: 50% ≥ 30 days, else 0.
  - Vendor cancellations always refund 100% of what was paid.
- **Tables:**
  - `bookings`: the customer's container; Phase 6 links it to an event.
  - `booking_items`: one per vendor, independent. They hold:
    - total, advance %, advance, paid, refund due and policy;
    - a snapshot of the listing and accepted quote lines;
    - the payment deadline.
  - `payments`: online or offline, created/paid/failed, Razorpay ids unique.
  - `refunds`: one per payment.
  - `payment_webhook_events`: de-duplicated by event id.
  - All audited. RLS: customer, the vendor's owners/branch managers, and finance (`finance.read`). No direct writes.
- **Booking:**
  - `booking_preview()` and `create_booking()` turn an accepted quote or an instant reservation into a booking.
  - Instant listings use the listed price, plus any auspicious surcharge, times guests or hours where the unit needs it.
  - Booking is idempotent per enquiry; the enquiry becomes `booked`.
- **Online payment:**
  - `start_payment()` records the payment: the advance while pending, then the balance. Unpaid attempts are reused.
  - The server creates the Razorpay order; `attach_payment_order()` is service-role only.
  - `confirm_online_payment()` is service-role only. It is called after the checkout signature check, and again by the webhook. It refuses a wrong amount and is idempotent.
  - Once the advance is covered, the booking is confirmed and the 48-hour hold becomes a confirmed reservation.
  - A payment that arrives after expiry or cancellation is queued for a full refund automatically.
- **Offline payment:** `record_offline_payment()` (vendor) is idempotent and capped at the balance due. Recording the advance confirms the booking.
- **Cancellation:**
  - `cancellation_quote()` shows the refund before confirming.
  - `cancel_booking_item()` (customer or vendor; the vendor must give a reason) releases the date and queues refunds per payment, online first.
- **Refunds:**
  - `begin_refund()` and `complete_refund()`: online refunds need `finance.manage`; offline ones can be done by finance or the vendor, with a reference.
  - `settle_online_refund()` handles the webhook.
- **Expiry:** `release_expired_holds()` (pg_cron, every minute) also expires unpaid bookings and their enquiries.
- **Contact:** the vendor sees the customer's phone and email for booked enquiries; messages stay open after booking.

### App
- **Enquiry page (customer):** after accepting a quote, or reserving an instant listing, a "Book this date" card shows:
  - the total, the advance and its %, and the cancellation policy with its refund rules;
  - **Book now** (with confirmation) opens the booking.
  - Booked enquiries link to the booking, on both the customer and vendor side.
- **My bookings** (`/account/bookings`): list, then a detail page with:
  - the pay-by countdown and **Pay advance / Pay balance** through Razorpay Checkout. The script loads only on click, and the key secret stays on the server.
  - When Razorpay isn't configured, the button is disabled with the reason, and the page suggests paying the vendor directly.
  - Amounts, the snapshotted quote lines, payments and refunds.
  - **Cancel** with the exact refund shown first.
- **Vendor bookings** (`/vendor/bookings`): open/all list, then a detail page with:
  - customer contact;
  - **record a payment received** (amount pre-filled with what's due; UPI/cash/bank/cheque; reference);
  - **cancel** (reason required; full refund shown);
  - **mark an offline refund as returned**.
- **Finance refunds** (`/admin/refunds`, `finance.read` to view, `finance.manage` to act):
  - a queue of due refunds, with **Issue refund** through the Razorpay refunds API for online payments;
  - shows whether Razorpay is in test mode, live mode or not configured.
- **Payment simulator (dummy gateway)** — product owner, 12 Nov: "give Razorpay as a dummy option; integrate the API key when required".
  - On when `PAYMENTS_SIMULATOR=true` **and** no Razorpay keys are set; real keys always win.
  - "Pay" opens a clearly labelled *Simulated payment (test mode)* dialog: **Pay (simulated)** or **Simulate a failure**. A banner on the booking page says payments are simulated.
  - It uses the same database path as Razorpay: `start_payment` as the customer, then the service role attaches an order and confirms it. Ids start with `order_sim_` / `pay_sim_` and appear as "Simulated online payment (test)".
  - Finance can issue refunds of simulated payments from /admin/refunds (also simulated, `rfnd_sim_`).
  - **Must be `false` (or removed) before real customers use the site**: anyone could "pay" without money.
- **Webhook** `POST /api/webhooks/razorpay`:
  - verifies the signature over the raw body, then de-duplicates by event id;
  - handles `payment.captured`, `order.paid`, `payment.failed`, `refund.processed` and `refund.failed`;
  - returns 503 when not configured and 400 on a bad signature; real failures return 500 so Razorpay retries.
- **Listing editor:** a new "Booking terms" section (advance %, cancellation policy with its rules shown).
- Navigation: **Bookings** is enabled for customers and vendors, and admin has **Refunds**.

---

## Phase 4 — completed

### Decisions (product owner, 11 Nov 2026)
- Customers must be **signed in** to enquire.
- An enquiry **holds the date for 48 hours**, then the hold is released automatically.

### Database (migration `20261113000100_enquiries_quotes.sql`)
- **Reservation core:** `private.reserve_core()` is shared by the vendor path (`reserve_resource`, unchanged contract) and the customer path. Locks the resource row, releases expired holds, checks capacity; the exclusion constraint guarantees no double booking.
- **Enquiries:** `create_enquiry()` validates the date (today → 2 years), times, guest limit, rate limit (20/day) and idempotency. It then places a **48-hour `platform` hold** on the first free resource linked to the listing, and refuses with `23P01` if none is free. Listings without linked resources accept enquiries without a hold; the vendor confirms manually.
- **Instant booking (G):** listings in instant mode become `reserved` at the listed price, with no quote step.
- **Quotations:** `send_quotation()` creates a new version with line items and supersedes older ones. **Totals are computed in SQL** (subtotal − discount + tax, integer paise). Sent quotes are immutable, and sending refreshes the hold for 48 hours. `withdraw_quotation()`; `respond_quotation()` (accepting extends the hold another 48 hours for the booking step).
- **Lifecycle:** `cancel_enquiry()` (customer) and `decline_enquiry()` (vendor) release the hold. `post_enquiry_message()` handles the thread. The cron `release_expired_holds()` now also expires enquiries and quotes whose time ran out.
- **Privacy:** `enquiry_contact()` gives the vendor the customer's name; phone and email only after the customer accepts or reserves. Staff don't see enquiries (owners and branch managers only).
- **`listing_availability()`** (public): per-day available / unavailable / unknown, plus auspicious flag and surcharge.
- **(A) Calendar safety:** holds that belong to an enquiry can't be silently released from the calendar.
- **(B) Pricing:** `services.auspicious_surcharge_bps`. The surcharge is shown to customers for auspicious dates and pre-filled into the vendor's suggested quote.

### App
- **Listing page:** the enquiry panel replaces the disabled button.
  - Pick a date → live availability badge, an auspicious-date badge, and the surcharge note.
  - Times (IST), guests, message → "Send enquiry", or "Reserve for 48 hours" for instant listings.
  - Signed-out visitors get a login link that returns them to the listing.
- **My enquiries** (`/account/enquiries`): list, then detail with a hold countdown, quotes (accept with confirmation / decline), cancel, and the message thread.
- **Vendor enquiries** (`/vendor/enquiries`): "needs action" / all filter; detail with customer name (contact after acceptance), request details, hold expiry, thread, decline with reason.
  - **Quote builder:** line items pre-filled from the listing price (incl. surcharge), discount, tax %, validity, notes, terms, and a live total that mirrors the SQL maths.
- **Vendor calendar** (`/vendor/calendar`): month view per resource or all resources, showing holds, bookings and blocks. Enquiry holds link to the enquiry. **Add offline booking or block (A)** in IST with conflict detection; release.
- **Listing editor:** new "Auspicious-date surcharge (%)" field.
- **Dev seed:** the three sample venues now have linked resources, so availability works.

---

## Phase 3 — completed

### Database (migration `20261112000100_vendor_erp.sql`)
- **Automatic go-live:** a `draft` vendor becomes `active` (listed) as soon as its profile has a description and phone **and** it has at least one published listing. Triggers on `business_profiles` and `services` enforce this; it never re-activates a suspended or closed vendor, and it is audited (`organization.activated`).
- **Verification workflow:**
  - uploading a document moves the vendor to `pending` (the review queue);
  - `review_business_document()` approves or rejects a document (rejecting needs a reason);
  - `set_organization_verification()` sets verified or rejected (verified needs at least one approved document; rejected needs a reason);
  - both require `verification.manage` and are audited.
- **Team invitations:**
  - `organization_invitations` table: branch manager or staff, optional branch list, 14-day expiry, one pending invite per email, RLS for the owner and the invitee;
  - RPCs `create_invitation`, `revoke_invitation`, `respond_invitation` (accepting grants the role and branch access atomically and never downgrades an existing member), and `my_invitations`.
- **`org_member_directory()`:** members see co-workers' names and roles; only owners and admins see emails.
- Listing slugs: an empty slug on insert is generated by the trigger.

### App
- **Vendor ERP** (sidebar now live for Listings, Resources, Branches, Team, Business profile, Verification documents):
  - **Dashboard:** go-live card that says whether the business is live, with each missing step linked to the page that completes it.
  - **Business profile:** name, legal name, tagline, description, year, contact (phones normalised to E.164), website, languages, GSTIN/PAN (validated, visible only to the team and verification staff). Owner-only editing; others see it read-only.
  - **Verification documents:** owner uploads PDF/JPG/PNG/WebP up to 10 MB straight to the **private** bucket, then views it through 2-minute signed links. Documents can be deleted until reviewed, and rejection reasons are shown.
  - **Listings:** list, create and edit, with category-aware sections (venue details for venues, per-plate prices, cuisines and plates for catering), pricing in rupees stored as paise, guest range, branch and area, booking mode (G). Status moves through an explicit table (publish, pause, archive). **Photos:** multi-upload to the public bucket, choose the cover, remove; up to 12.
  - **Resources:** halls, artists, teams, equipment; exclusive or shared capacity; setup, breakdown and travel buffers; link to a listing and branch; deactivate. Ready for Phase 4 calendars.
  - **Branches:** add, edit (managers edit their own), deactivate (not the primary branch).
  - **Team:** members with inline role change (the database refuses to remove the last owner), remove with confirmation, pending invitations with revoke, and an invite form with role and branches.
- **Invitations:** existing users see pending invitations on **My account** and accept or decline (accepting opens that business). New people receive an email (template `supabase/templates/invite.html`) that signs them in and asks them to set a password.
- **Admin verification queue:** `/admin/verification` → per-vendor review: open each document via a signed link, approve or reject with a reason, then mark the vendor verified or rejected. Verified vendors get the badge and rank first in search immediately.

---

## Phase 2 — completed

### Database (migration `20261111000100_listings.sql`)
- `services`: the listing a vendor publishes.
  - Category, booking mode (G), status (`draft` / `published` / `paused` / `archived`).
  - Price type (fixed / from / range / on request) and unit, in integer paise (D6).
  - Guest limits, city/area, validated JSON attributes for categories without a typed table.
  - A weighted full-text `search_document` ('simple' config, so Kannada/Hindi words index as typed) plus a trigram index on the title.
- Typed extensions for the launch categories (D4): `venue_details` (capacities, rooms, parking, AC, catering/décor/alcohol policy) and `catering_details` (veg/non-veg per-plate prices, cuisines, plate limits).
- `service_media` + public `listing-media` bucket (owner/branch-manager upload into their org folder).
- `budget_benchmarks` (F): admin-entered low–high ranges per category and city, unit per guest or per event. New permission `pricing.manage` (super admin, finance operator).
- Public discovery only through `SECURITY DEFINER` functions that return a fixed set of safe columns, so anonymous users cannot read the raw tables:
  - `search_listings()`: text, city, category, guests (respects venue capacity), max price, five sort orders, paging, total count. Verified vendors rank first.
  - `get_listing(slug)`: full detail without vendor contact details (enquiries go through the platform from Phase 4).
- Visibility rule: `published` service **and** `active` organisation.
- RLS on every new table; vendors manage only their own organisation's listings (branch managers only their branch). All changes are audited.

### App
- **Header:** navigation (Find vendors, Muhurtham dates, Budget estimator, List your business), a **city picker** remembered in a cookie with no default (D7 pending), and a mobile menu.
- **Home:** hero search, clickable category cards, upcoming muhurtham dates, estimator call-to-action.
- **`/search`:** keyword search plus filters (category, guests, max starting price, sort) and pagination. Filters are a GET form, so URLs are shareable and work without JavaScript. Cached results (`listings` tag).
- **`/listings/[slug]`:** gallery (branded placeholder until photos exist), price, guest range, venue/catering facts, vendor profile, upcoming muhurtham dates for that city. "Send enquiry" is visibly disabled with the reason (Phase 4).
- **`/muhurtham` (B):** Sunday-first month calendar with demand highlighting, month navigation, city filter, list of the month's dates with muhurtham windows, and a "confirm with your priest" disclaimer.
- **`/budget-estimator` (F):** city, guests, categories → per-category ranges and a total, links into search, and an "indicative, not quotes" disclaimer.
- **Admin:** `/admin/pricing` and `/admin/muhurtham` editors (add, edit, publish, delete with confirmation). Each requires its own permission and refreshes the public cache immediately.
- **Dev seed:** 7 sample vendors and 8 published sample listings across both cities, sample muhurtham dates and estimator ranges (all labelled Sample / DEV SAMPLE), and dev logins (README).
- **Types:** `src/types/database.ts` is now generated from the real schema (`npm run db:types`).

---

## Phase 1 — completed

### Setup
- Next.js 16.4 (App Router, TypeScript strict, Tailwind 4, ESLint, `src/`), Cache Components + Partial Prefetching enabled.
- shadcn/ui components (Radix), Lucide, React Hook Form, Zod 4, next-intl 4, Supabase JS + SSR. TanStack Query is installed but not used yet; Phase 1 has no client-side server state.
- Supabase CLI (dev dependency), `supabase init`, `config.toml` tuned:
  - password ≥ 8 characters with letters + digits;
  - redirect allow-list;
  - email confirmation off locally only.
- `.env.example` (placeholders only), Prettier, Vitest, Playwright configs.
- Design tokens in `src/app/globals.css`:
  - burgundy/wine primary, warm ivory background, muted gold accent, white cards, charcoal text;
  - light theme, `.dark` ready.
- Fonts: Geist (UI), Fraunces (display), with Noto Sans Kannada / Devanagari as glyph fallbacks.

### Database (11 migrations, RLS on every table)
- Extensions: `pgcrypto`, `btree_gist`, `citext`, `pg_trgm`. `pg_cron` where available.
- Identity:
  - `profiles`, auto-created on signup, with phone (E.164) ready for OTP later;
  - `roles`, `permissions`, `role_permissions`, `user_role_assignments`;
  - new users get the `customer` role.
- Organisations:
  - `organizations`, `organization_members` (with a last-owner guard), `branches`, `member_branch_access` (composite FKs keep the org consistent);
  - `business_profiles`, `business_documents` + private `business-documents` storage bucket.
- Taxonomy:
  - 15 business categories, with venues, catering and décor flagged as launch focus (D4);
  - 74 service categories;
  - candidate cities Kalaburagi and Bengaluru;
  - `areas`;
  - `auspicious_dates` (enhancement B, admin-managed).
- Governance:
  - append-only `audit_logs`, with a generic audit trigger on availability, organisations, members, roles, documents, policies and dates;
  - `consent_records` (append-only), `policy_versions` (immutable once published), `notification_preferences`.
- Availability (D5):
  - `bookable_resources` + `resource_reservations`;
  - GiST exclusion constraint for exclusive resources;
  - buffer-aware `blocked_period`;
  - `source` column (enhancement A).
- RPCs:
  - `my_access()`, `create_organization()`;
  - `reserve_resource()`: row lock, capacity sums, expired-hold release, idempotency key;
  - `release_reservation()`;
  - `release_expired_holds()`, scheduled every minute via pg_cron.
- RLS helpers `is_platform_admin`, `has_platform_permission`, `is_org_member`, `has_org_role`, `can_access_branch`: all `SECURITY DEFINER` with an empty `search_path`.

### App
- Auth pages:
  - login (password + magic link), register, forgot password, reset password, check-email;
  - `/auth/callback` (PKCE) and `/auth/confirm` (token hash) handlers;
  - open-redirect-safe `?next=`.
- `src/proxy.ts`:
  - refreshes the Supabase session on every request;
  - applies next-intl locale routing;
  - sends signed-out users from `/account`, `/vendor`, `/admin` to login.
- Server guards in every portal layout **and** page:
  - customers see *Access denied* on `/vendor` and `/admin`;
  - vendor access requires a membership; admin access requires `admin.access`.
- Shells:
  - marketplace header/footer;
  - account, vendor ERP and admin shells built on one shared `PortalShell` (desktop sidebar, mobile slide-over);
  - the vendor shell has an org and branch switcher, verified server-side.
- Shared components: Sidebar/nav, Header, PageHeader, DataTable, StatusBadge, EmptyState, LoadingState, ErrorState, ConfirmDialog, AccessDenied.
- `error.tsx`, `loading.tsx` and `not-found.tsx` per area.
- Dashboards use real data with empty states:
  - account: profile form, roles, businesses;
  - vendor: status, branches, resources, upcoming reservations, getting-started checklist;
  - admin: permission-gated org counts, verification queue, user count, recent audit events.
- Vendor onboarding at `/become-a-vendor`:
  - `create_organization` RPC with an idempotency key;
  - the caller becomes owner, and a primary branch and business profile are created;
  - the new org starts as `draft`.
- i18n (enhancement D): `en` is the source of truth; `kn` and `hi` are partial and fall back to English per key; no hard-coded UI strings.

---

## Decisions taken during Phase 1

| # | Decision | Why |
|---|---|---|
| P1-1 | Brand shown as **Eventzo** (one constant in `src/config/site.ts`) | Product owner, 10 Nov |
| P1-2 | **Locale-prefixed URLs**: English unprefixed, `/kn/*`, `/hi/*` | Product owner, 10 Nov. SEO for Kannada/Hindi; works with prerendering |
| P1-3 | Keep **Cache Components** on; locale read via `next/root-params` | It becomes the default in the next Next.js major. Public pages prerender, portals render per request (`instant = false`) |
| P1-4 | Access denied is rendered by layouts, not `forbidden()` | `forbidden()` is still experimental in Next 16.4 |
| P1-5 | Vendor onboarding lives at `/become-a-vendor`, outside `/vendor` | So "customers are blocked from `/vendor`" holds without exceptions |
| P1-6 | New orgs: `draft` + `unverified`; primary branch auto-created; max 5 orgs per account | Listings go live only once the org is `active` (see P2-1); abuse guard |
| P1-7 | Admin access = the `admin.access` permission, not role names | Lets admin powers stay split by permission |
| P1-8 | Categories and cities are in a **migration** (real reference data); areas and sample dates are in **seed.sql** (dev-only, unverified) | "No fake data presented as real" |
| P1-9 | A 4th Supabase client, `createPublicClient` (anon, no cookies), for cached public reads | Needed so `"use cache"` never holds user data |
| P1-10 | shadcn/ui components were written by hand | `ui.shadcn.com` was unreachable from this machine. `components.json` is present, so `npx shadcn add` works later |

## Decisions taken during Phase 2

| # | Decision | Why |
|---|---|---|
| P2-1 | **Any active vendor is listed**; verified vendors get a badge and rank first | Product owner, 11 Nov |
| P2-2 | Estimator uses **admin-entered price ranges** per category and city | Product owner, 11 Nov. Works from day one; real figures come from the Eventzo team |
| P2-3 | **City picker with no default**, remembered in a cookie | Product owner, 11 Nov. Keeps D7 open |
| P2-4 | Public reads go through two RPCs, never the raw tables | Exposes a fixed, safe column set (no vendor contact details) |
| P2-5 | Admin editors for price ranges and muhurtham dates were pulled forward from Phase 8 | Without them the estimator and calendar could not get real data in production |
| P2-6 | Typed extension tables for venues and catering; JSON attributes for other categories | Architecture rule: no giant `services` table |

## Decisions taken during Phase 3

| # | Decision | Why |
|---|---|---|
| P3-1 | **Automatic go-live** when profile (description + phone) is complete and one listing is published | Product owner, 11 Nov |
| P3-2 | **Email invitations**: existing users accept in their account; new people get a Supabase Auth invite to set a password | Product owner, 11 Nov |
| P3-3 | **Minimal verification queue** now (approve/reject documents, verify/reject vendor) | Product owner, 11 Nov |
| P3-4 | Files upload **browser → storage** directly; the server records them after re-checking the path is `{own org}/{uuid}.{ext}` | Avoids the 1 MB Server Action body limit; storage RLS already restricts writes to the owner's folder |
| P3-5 | Listings are archived, never hard-deleted | Bookings (Phase 5) will reference them |
| P3-6 | Invitation emails link to `/auth/confirm` (token hash), not the default fragment link | The server can't read URL fragments; works across devices |

## Decisions taken during Phase 4

| # | Decision | Why |
|---|---|---|
| P4-1 | Enquiries require login | Product owner, 11 Nov |
| P4-2 | 48-hour holds; sending or accepting a quote refreshes the hold | Product owner, 11 Nov (48 h) |
| P4-3 | Quote totals computed only in SQL; the UI preview mirrors the same rounding | Money integrity (D6) |
| P4-4 | Customer contact (phone/email) revealed to the vendor only after acceptance or reservation | "Minimum necessary customer details" |
| P4-5 | Enquiries hold the first free linked resource; no linked resource = no hold, "vendor will confirm" | Vendors without calendars can still receive enquiries |

## Decisions taken during Phase 5

| # | Decision | Why |
|---|---|---|
| P5-1 | Advance % per listing (default 25, 10–100), snapshotted | Product owner, 12 Nov |
| P5-2 | Balance online or recorded offline by the vendor | Product owner, 12 Nov; keeps records truthful (A) |
| P5-3 | Pay the advance within the 48 h hold, else the booking expires | Product owner, 12 Nov |
| P5-4 | Per-listing cancellation policy; refunds computed, issued manually | Product owner, 12 Nov; D8 (no automatic payouts) |
| P5-5 | Only the service role marks online payments paid (signature-verified callback or webhook) | A customer can never mark their own payment paid |
| P5-6 | A late payment (after expiry/cancellation) is refunded automatically, not silently kept | Money integrity |
| P5-7 | A booking reads its payments and refunds in one query | The paid total and the payment list always agree |
| P5-8 | Dummy payment gateway behind `PAYMENTS_SIMULATOR`, overridden by real keys | Product owner, 12 Nov: demo payments now, Razorpay later without code changes |

## Decisions taken during Phase 6

| # | Decision | Why |
|---|---|---|
| P6-1 | In-app notifications now; WhatsApp/email go through an outbox, delivered by a provider adapter or the `NOTIFICATIONS_SIMULATOR` | Product owner, 12 Nov: no WhatsApp provider yet (C) |
| P6-2 | A private RSVP link per guest; the token is the credential and can be regenerated | Product owner, 12 Nov: most guests have no account (E) |
| P6-3 | Co-host / viewer roles; only the owner books, pays or cancels | Product owner, 12 Nov |
| P6-4 | Only the owner's own enquiries can be filed under an event | The person who pays is always the event owner |
| P6-5 | Notifications are created by database triggers and never raise | Every path (RPC, webhook, offline entry) notifies the same way, and a notification problem can't undo money or bookings |
| P6-6 | Sharing an invitation uses a wa.me link from the host's own WhatsApp | Works today without a provider or approved templates |
| P6-7 | Cancelling an event never cancels vendor bookings | One vendor's (or the event's) decision never cascades (§1) |

## Decisions taken during Phase 7

| # | Decision | Why |
|---|---|---|
| P7-1 | Roster entries don't need an Eventzo login; linking one is optional | Product owner, 12 Nov: many helpers have no smartphone |
| P7-2 | Staff see the customer's first name and venue; the phone only from 2 days before to 1 day after the job | Product owner, 12 Nov (§7 minimum necessary) |
| P7-3 | Receivables, expenses and payment receipts; no GST tax invoices | Product owner, 12 Nov; D8 (CA review first) |
| P7-4 | Installable staff app with an offline copy of the job list; answers need a connection | Product owner, 12 Nov (H) |
| P7-5 | A job is created lazily on the first assignment (or when its details are saved), only for confirmed or offline bookings | No empty jobs for unpaid holds; one job per booking |
| P7-6 | A staff member can't be on two overlapping jobs; an artist's own resource is reserved as well | §6 "teams: reserve each assigned artist's resource" |
| P7-7 | Staff payouts are expenses linked to the assignment (one each), not money movements | Eventzo doesn't move vendor money (D8) |
| P7-8 | Receipt numbers are per vendor per Indian financial year, assigned when a payment becomes paid | Matches how Indian businesses number receipts; gaps can't appear from unpaid attempts |
| P7-9 | Reports run in one SQL function that applies the caller's branch scope itself (changed in Phase 9 from security-invoker RLS for speed) | One source of truth for numbers; branch managers get only their branches (tested) |
| P7-10 | The service worker is registered only in production builds and caches only the job list page and hashed static files | No stale dev chunks, and no private data cached beyond that one page |

## Decisions taken during Phases 8 and 9

| # | Decision | Why |
|---|---|---|
| P8-1 | Suspension and closing never cancel bookings | Product owner, 12 Nov; one decision never cascades (§1) |
| P8-2 | Blocking is recorded in the database and enforced in two places: the app (`my_access`) and Supabase Auth (ban) | The app reacts immediately; Auth stops new sign-ins |
| P8-3 | Support view through one audited function, not table reads | Every look at a person's data leaves a trace (§7 admin actions audited) |
| P8-4 | Taxonomy entries are hidden, never deleted | Listings, bookings and history refer to them |
| P8-5 | Admin navigation hides pages a role can't open | Less confusion; the pages and RLS still check |
| P9-1 | CSP without nonces (`'unsafe-inline'` scripts) | Pages are partly prerendered; nonces would force every page dynamic. All other directives are strict |
| P9-2 | CI never uses a hosted Supabase project | Tests create users and data; the local stack is thrown away |

---

## Migrations

| File | Contents |
|---|---|
| `20261110000100_extensions.sql` | extensions, `private` schema |
| `20261110000200_shared.sql` | `set_updated_at()`, enums |
| `20261110000300_identity.sql` | profiles, roles, permissions, signup trigger |
| `20261110000400_taxonomy.sql` | categories, cities, areas, auspicious dates (+ reference data) |
| `20261110000500_organizations.sql` | organisations, members, branches, business profile/documents |
| `20261110000600_governance.sql` | audit logs + trigger, policy versions, consent, notification prefs |
| `20261110000700_availability.sql` | bookable resources, reservations, exclusion constraint |
| `20261110000800_rls_helpers.sql` | RLS helper functions |
| `20261110000900_rls_policies.sql` | RLS enabled on every table, grants and policies |
| `20261110001000_rpc.sql` | `my_access`, `create_organization`, `reserve_resource`, `release_*`, pg_cron |
| `20261110001100_storage.sql` | private `business-documents` bucket + policies |
| `20261111000100_listings.sql` | services, venue/catering details, media + public bucket, budget benchmarks, `pricing.manage`, `search_listings()`, `get_listing()` |
| `20261114000100_bookings_payments.sql` | listing booking terms, bookings, booking items, payments, refunds, webhook log, payment/refund RPCs, expiry update |
| `20261113000100_enquiries_quotes.sql` | reservation core, enquiries, messages, quotations, availability RPC, expiry job update, auspicious surcharge |
| `20261112000100_vendor_erp.sql` | automatic go-live, verification workflow + RPCs, team invitations + RPCs, member directory, slug generation tweak |
| `20261115000100_events_notifications.sql` | events, members, invitations, guests + RSVP tokens, budget lines, event links on enquiries/bookings, co-host access, notifications + outbox + triggers, WhatsApp consent, `notifications.manage` |
| `20261116000100_vendor_ops.sql` | staff roster (+ resource link), jobs, assignments (overlap guard, artist reservation), staff job view `my_jobs`, expenses, receipt numbers + `payment_receipt`, `vendor_report`, job notifications, calendar guard for staff reservations |
| `20261117000100_admin_ops.sql` | vendor suspend / close / reinstate with reason, user blocking (`users.block`, sessions ended, `my_access` honours it), admin user/vendor lists, audited support view, vendor overview, last-super-admin guard, vendor status notifications |

---

## Test results

All results from 12 Nov 2026 (after Phase 9), local Supabase stack (Docker, Postgres 17), production build, Razorpay and WhatsApp/email providers **not** configured. Browser tests run with the payment and notification simulators on.

| Check | Result | Notes |
|---|---|---|
| `npm run typecheck` / `npm run lint` | ✅ pass | 0 errors, 0 warnings |
| `npm test` (Vitest) | ✅ **272 / 272** | + Phase 8 (12): suspend/close need a reason (reinstate doesn't), block needs a reason, only staff roles can be granted, the blocked sign-in message, URL names from English names, translations kept only when typed, category/city/area validation, audit and ledger filters drop bad values, page bounds. Phase 7 (30): roster and assignment schemas (call date + time together, pay limits), staff-app buttons mirror `respond_job` (check-in a day before, complete after start), IST dates and grouping, overnight jobs count as today, financial year and period presets, custom ranges (reversed / too long fall back), amounts in words (lakh, crore, paise), CSV quoting and formula injection, expense and payout schemas, staff link only on artist/team resources, receipts are protected, job notifications have text and templates. Phase 6 (30): pasted guest lists (Indian mobiles, bad lines reported), event budget maths (cancellations, overspend, unplanned categories), guest summary, RSVP and wa.me links, event/guest/RSVP/budget schemas, every database notification kind has text and a WhatsApp template, placeholders, masking, delivery mode. Phase 5 (31): gateway mode (off / simulator / keys win), advance rounding, refund policy table, amounts due, Razorpay checkout and webhook signatures (tampering rejected), webhook parsing, booking schemas, listing booking terms |
| `npm run db:test` (pgTAP) | ✅ **345 / 345** | Run inside the DB container because the CLI couldn't reach port 54322 at the time. + report scope (2): a branch manager's report counts only their branch; the owner's counts every branch. Phase 8 (41): customers, vendors and verification operators can't change a vendor's status, and the column can't be written directly; suspending needs a reason; a suspended vendor takes no enquiries and leaves search, while existing enquiries are untouched; the owner is notified; the change is audited; editing never re-activates; reinstate, close, reinstate again; blocking needs `users.block` and a reason; nobody blocks themselves; support can't block admins; a block ends sessions, is audited with its reason, and the person reads as signed out and can't unblock themselves; unblock restores access; user and vendor lists are permission-gated; support finds users with roles; the support view lists enquiries, hides payments without finance or support rights, and audits every view; finance sees vendor money and support doesn't; anon refused; the last super admin can't be removed. Phase 7 (62): roster isolation between businesses, a login from another business can't be linked, staff see only their own profile and can't raise their rate, customers see no roster, unpaid bookings can't be staffed, receipt numbering, idempotent jobs, staff can't create jobs or assign themselves, double assignment and overlapping jobs refused, call-time window, offline jobs carry their notes, an assigned artist's calendar is blocked and can't be released from the calendar, staff notified (privately), the job list shows the first name and own pay but no phone weeks ahead, staff can't read bookings, payments or expenses, accept / check-in / complete timing, the phone appears 2 days before, decline notifies the owner, unassign releases the artist, payouts categorised and linked (once), expenses and reports closed to other businesses and staff, report totals, receipts for the customer and vendor only, financial-year boundary at IST midnight, releasing an offline booking or cancelling a booking cancels the job and releases the artist while completed work stays, anon refused. Phase 6 (54): idempotent creation, outsiders see nothing, invitations (email match, no owner role, no duplicates), co-host vs viewer rights on guests, budget and threads, tokens hidden from the table, anonymous RSVP with headcount limit, regenerated links revoke old ones, hosts notified (viewers not), vendor notified of enquiries, only the owner files enquiries under events, WhatsApp needs a phone and stops after opt-out, outbox closed to customers, members leave and lose access. Phase 5 (48): booking from an accepted quote (idempotent, snapshotted), privacy between customers, anon refused, only the service role can attach orders or mark payments paid, wrong amount refused, duplicate confirmation is a no-op, advance confirms the booking and reservation, balance online or offline, overpayment refused, offline payments audited, moderate/flexible/strict refunds, refunds split per payment, cancel frees the date, vendors can't issue online refunds, offline refunds need a reference, finance reads bookings, listing edits don't change bookings, a vendor cancellation needs a reason and refunds 100%, unpaid bookings expire, a late payment is queued for refund, webhook log locked |
| `npm run db:check` (PGlite) | ✅ pass | fresh install of all 18 migrations |
| `supabase db lint` · `npm audit --omit=dev` · `npm run format:check` | ✅ clean | no schema errors · 0 vulnerabilities · formatted |
| `npm run build` | ✅ pass | |
| `npm run test:e2e` on the production build (with the new CSP) | ✅ **92 / 92** (46 tests, desktop + mobile) across one-worker runs | The first full run had 79 pass. The rest timed out while the dev server, Docker and browsers shared one laptop: pages took over 30 s to load, and the vendor report query took about 5 s for the sample vendor (fixed, see below). All passed on rerun. Phase 8 (8): a fresh vendor is suspended (button disabled until a reason is given), the owner sees the reason and that bookings continue, the admin reinstates (back to draft), and the vendor's audit history shows the change; a person is found in the support view and blocked with a reason, which signs them out, and their sign-in says the account is blocked; after unblock they sign in; granting finance shows them the ledger but not the other admin pages, and revoking removes it; the audit log finds the block; an area is added (URL name filled automatically, Kannada name), a duplicate is refused, and it is hidden; customers are denied all five new admin pages, and those pages fit a phone. Phase 7 (6): staff roster with login → assignment → job app → payout, finance, receipt; schedule, reports, installable app; receipts need sign-in. Earlier phases: auth, discovery, enquiries, bookings and payments, events and RSVP, vendor ERP, phone layouts. One-worker runs; intermittent local Docker stalls (a sign-up or upload hanging, never the same test twice) pass on rerun |

---

## Known issues and limitations

1. **The payment simulator is ON in `.env.local` (Eventzoo).** Turn it off (`PAYMENTS_SIMULATOR=false`) before any real customer uses the site.
1. **The notification simulator is ON in `.env.local`** (`NOTIFICATIONS_SIMULATOR=true`): queued WhatsApp/email messages are marked "sent" without reaching anyone. In-app notifications are real. Real delivery needs a WhatsApp provider (Meta Cloud API or a partner such as Gupshup/Interakt) with the 17 templates approved, plus an email provider. The adapter goes in `src/features/notifications/lib/delivery.ts`.
1. **Nothing runs the outbox on a schedule yet.** Operators can press *Send queued now*. On Vercel, add a cron job for `/api/cron/notifications` and set `CRON_SECRET`.
1. **Co-host invitations to people without an account** are queued as email, but nothing delivers them yet. Until then, tell them to sign up with that email: the invitation appears on their events page.
1. **Notification texts are stored as a kind plus values**, so they show in the reader's language (English today; Kannada and Hindi need translations).
1. **Razorpay checkout is untested end-to-end** until test keys are added. Signature checks, order handling, webhook parsing and the payment state machine are covered by unit and database tests; the browser checkout and a real webhook delivery need keys plus a tunnel (e.g. ngrok) or a deployed URL.
1. **Not built (D8):** escrow, split settlement / vendor payouts, invoices with GST, TCS. They need the CA review first.
1. **Refunds are issued by people** (finance for online, the vendor for offline money), never automatically.
1. **Policy text is product copy, not legal text.** The three cancellation policies need legal review before launch.
1. **Local test runs are sensitive to machine load.** Docker's `vector` log container is in a restart loop on this laptop; a one-worker run is the reliable sign-off.
1. **A date typed before the page finishes loading** isn't checked until the field changes again. Rare for people; tests wait for the page to settle.

1. **Hosted Supabase needs the invite email template.** Locally it comes from `supabase/config.toml`; on the hosted project paste `supabase/templates/invite.html` into Authentication → Email Templates → Invite user. Production also needs custom SMTP for emails to deliver reliably.
2. **Member branch access is set at invitation time.** Changing an existing member's branches needs a re-invite; a branch-access editor is not built yet.
3. **Staff see the whole team list and the listings and resources of their branch** (read-only). Customer data reaches them only through *My jobs*.
1. **Phases 7 and 8 are not on Eventzoo yet**: push `20261116000100_vendor_ops.sql` and `20261117000100_admin_ops.sql` when you're ready. Nothing is deployed to Vercel yet.
1. **CI hasn't run on GitHub yet** (the repository isn't pushed). The workflow's steps were checked locally, but the GitHub runner itself is untested.
1. **Blocking:** an access token issued before the block keeps working against the Supabase API directly for up to an hour (its lifetime). Inside the app the person is signed out at once, and new sign-ins are refused.
1. **The CSP allows inline scripts** (Next.js bootstrap). Moving to nonces would make every page dynamic; revisit if a stricter policy is required.
1. **No error-tracking service** (e.g. Sentry) is connected; server errors go to the hosting logs. Adding one needs an account and DSN.
1. **The admin dashboard home** still shows the Phase 1 summary cards; a live platform dashboard wasn't chosen for Phase 8.
1. **Receipts are not GST tax invoices.** GST invoices (numbering, HSN/SAC, tax split) wait for the CA review (D8).
1. **The staff app's offline copy lives on the phone.** It is deleted at sign-out and never cached for signed-out visits. On a shared phone, staff should sign out. It only works in production builds (or a deployment), never under `npm run dev`.
1. **Offline bookings have no customer record,** so staff see only the job's instructions there (write the contact into them if needed).
1. **An artist is protected from double-booking by customers only when linked to their own Artist resource.** Staff without one are still protected against overlapping jobs.
1. **Finance numbers are for the vendor's own bookkeeping**, not accounting or tax returns. Payouts are records, not payments made through Eventzo.
1. **Notes on a staff profile are visible to that person** if their login is linked (the form says so).
1. **Staff app texts are English**; Kannada and Hindi translations are needed for real staff (D).
4. **Photos can't be reordered yet** (only the cover can be chosen).
5. **Go-live is one-way.** Removing the description later doesn't take a vendor offline; admins can suspend (Admin → Vendors).
6. **Local E2E runs use 2 browser workers.** On this laptop (dual-core, 4 GB Docker VM) 4+ workers saturate the machine and requests queue past timeouts. Override with `PW_WORKERS`. Tests create real data in the local DB; `npm run db:reset` gives a clean slate.
7. **Unknown listing URLs return HTTP 200** with the not-found page and `noindex`.
8. **Translations:** `kn.json` and `hi.json` cover navigation, auth and the home hero only; the vendor ERP is English-only for now. Needs native-speaker review.
9. **Category taxonomy is a draft** (15 / 74); please review against the Blueprint.
10. **No terms/privacy consent at signup yet** (no legal text).
11. **Estimator ranges and muhurtham dates** must be entered by your team in production.
12. **pg_cron**: confirm it is enabled on the hosted project.
13. **Pending product decisions:** D7 launch city; D8 CA review of GST/TCS before live payments.

---

## Fixes made during Phase 1 sign-off (11 Nov)

- **Session reads are explicitly request-time.** `getCurrentUser()` calls `connection()` first, because Supabase's `getClaims()` reads the clock, which Cache Components flagged.
- **Auth-gated pages opt out of instant-navigation validation.** Account, vendor and admin pages set `instant = false`, because their layout may render Access denied instead of the page.
- **Turbopack root pinned** in `next.config.ts`: a stray `package-lock.json` in the user home folder confused root detection.
- **`npm test` runs through `scripts/run-vitest.mjs`.** It starts Vitest from the canonical path, so a terminal opened as `c:\…` instead of `C:\…` no longer breaks every suite.
- **E2E harness:** a 30 s expect timeout to allow for dev-server compiles, and the wrong-password check targets the form's alert rather than Next's route announcer.

## Fixes made during Phase 2 (11 Nov)

- **Mobile layout:** wide tables were stretching the page to 496 px on a 412 px phone, so the admin Save button was covered and couldn't be tapped. Grid columns now shrink (`min-w-0` / `minmax(0,1fr)`) and tables scroll inside their own box. The header hides "Sign up" and the city name on phones, and its loading placeholders now match the real controls. An E2E check now fails if any key page scrolls sideways.
- **Prerendering:** "today" (IST) is computed after `connection()`, and the language switcher streams behind `<Suspense>` on dynamic routes.
- **Slug lookups** use citext's own operator, so the unique index is used even with an empty `search_path`.

## Fixes made during Phase 3 (11 Nov)

- **React Compiler compatibility:** forms use `useWatch` instead of RHF `watch()`, which can't be memoised safely.
- **Local images:** `next/image` may load from 127.0.0.1 only when Supabase itself is local, never for a hosted project.
- **E2E isolation:** tests no longer depend on exact result counts or a fresh database, and parallel runs use distinct data where uniqueness rules apply.

## Fixes made during Phase 5 (12 Nov)

- **Booking page snapshot:** the booking, payments and refunds were read in separate queries, so a payment recorded at that moment could show in the list while the paid total was still old. They are now read in one query (P5-7).
- **E2E date collisions:** the local DB keeps holds and bookings from earlier runs, so random dates sometimes clashed. Enquiry and booking tests now pick a date that is actually free.

## Fixes made during Phase 6 (12 Nov)

- **WhatsApp opt-in ordering:** two consent changes in one transaction got the same `now()`, so "latest" was ambiguous. Consent rows from `set_whatsapp_consent()` now use `clock_timestamp()`.
- **RSVP and host-RSVP forms** use `noValidate` like the other forms. The browser's own number check had been hiding the server's message.

## Fixes made during Phase 7 (12 Nov)

- **Staff job list window:** `my_jobs()` showed jobs only 90 days ahead, but bookings run up to two years ahead, so a job 4 months away was invisible to the staff member. It now covers the full two years. The schedule also gained 90-day and 1-year views.
- **Calendar E2E test:** it booked a random date on the main hall without checking it, and earlier runs had filled that hall's calendar. It now tries another date when the first one is taken. On the first full run, 79 of 84 passed: this test failed on both desktop and mobile, and three tests stalled on the local stack (a sign-up, a login, a photo save). All five passed on rerun.
- **ConfirmDialog** accepts extra content (used for the "can't make it" reason).

## Fixes made during Phases 8 and 9 (12 Nov)

- **Area and service-type forms** kept forgetting the chosen city or category after each save, which made it easy to add a second area to the wrong city. They now keep it.
- **Vendor report speed:** `vendor_report()` took about 5 s for the sample vendor, because RLS was checked on every row and the data was re-scanned once per month, listing, resource and staff member. It now works out the caller's scope once (owner: every branch; branch manager: their branches; the same rules as RLS) and aggregates in single grouped passes: **about 0.2 s**. New pgTAP tests confirm the branch scope.
- **Sitemap** logs a database error instead of silently listing no listings.

## Next step

**All nine phases are built.** To validate:

1. **Push to Eventzoo** (your go-ahead needed): `npx supabase db push --remote` applies the Phase 7 and 8 migrations (16 → 18). Then run `npm run dev` against Eventzoo and walk through:
   - **Vendor:** Staff, Schedule, My jobs, Finance, Reports and receipts.
   - **Admin** (as `admin@sample.eventzo.test`): Vendors (suspend and reinstate a test vendor, not a sample one others use), Users (support view, block and unblock a test account), Categories & cities, Audit log, Payments ledger.
2. **Deploy** when ready: follow `DEPLOYMENT.md` (Vercel project, environment variables, Supabase Auth URLs and SMTP, cron plan). The staff app needs HTTPS to install on phones.
3. **Before real customers:** the go / no-go list in `DEPLOYMENT.md` §3. Most of it is yours: D7 city, D8 CA review, legal texts, translations, and the WhatsApp provider.
