# Eventzo — Deployment & launch checklist

How to put Eventzo on the internet (Vercel + Supabase), and what must be true before real customers use it. Work top to bottom. Never paste keys into chat or commit them: they go in Vercel's environment settings, or `.env.local` on your machine.

---

## 1. Supabase (production project)

Eventzoo (`qpjpnmohxkfvwduqvtuy`, Sydney) holds the **dev seed** (sample vendors and logins). For launch, either:

- **Recommended:** create a clean project in **Mumbai (ap-south-1)**, close to Indian users, and push migrations only:
  ```bash
  npx supabase link --project-ref <new-ref>
  npx supabase db push            # migrations only; never --include-seed in production
  ```
- or keep Eventzoo and delete the sample data (every `Sample …` vendor and the `@sample.eventzo.test` logins) before launch.

Then in the Supabase dashboard:

| Where | Setting |
|---|---|
| Database → Extensions | `pg_cron` enabled (expires holds and unpaid bookings every minute). Check with `select * from cron.job;` |
| Authentication → URL Configuration | *Site URL* = `https://<your-domain>`; *Redirect URLs* include `https://<your-domain>/**` |
| Authentication → Providers → Email | *Confirm email* **on**; minimum password length 8 |
| Authentication → SMTP | A real email sender (Amazon SES, Postmark, Resend, Zoho…). The built-in sender is rate-limited and not for production |
| Authentication → Email Templates | *Invite user*: paste `supabase/templates/invite.html`. Optionally switch *Confirm signup* / *Reset password* to the `{{ .SiteURL }}/auth/confirm?token_hash=…` links in the README |
| Authentication → Rate limits | Defaults are fine to start; raise email limits once SMTP is set |
| Project Settings → Add-ons | Consider a **custom domain** for the API (`api.<your-domain>`): some Indian ISPs (Jio, some Airtel) block `supabase.co` |
| Database → Backups | Daily backups are on paid plans; enable **Point-in-Time Recovery** before taking real payments |

Create the first super admin once (SQL editor), with your own email:

```sql
insert into public.user_role_assignments (user_id, role_id)
select u.id, r.id from auth.users u, public.roles r
where u.email = 'you@example.com' and r.code = 'super_admin';
```

---

## 2. Vercel

1. Import the GitHub repository into Vercel (framework: Next.js; no build-command changes).
2. Choose the function region **closest to the database** (Mumbai `bom1` for a Mumbai project, Sydney `syd1` for Eventzoo).
3. Add the environment variables below (Production, and Preview pointing at a non-production project).
4. Deploy, then add your domain under *Domains*.

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key | Public (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key | **Server-only.** Never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` | Used for links in invitations, RSVP and emails. **Must be `https://`**; it also switches on HSTS |
| `PAYMENTS_SIMULATOR` | `false` | **Must be false for real customers** |
| `NOTIFICATIONS_SIMULATOR` | `false` | **Must be false for real customers** |
| `CRON_SECRET` | 32+ random characters | Vercel Cron sends it automatically to `/api/cron/notifications` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | From Razorpay | Test keys first. Live keys only after the CA review (D8) |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | From Meta (section 3.2) | **Server-only.** Use a System User token, not a 24-hour test token |
| `KANNADA_FIRST_CITIES` | optional, default `kalaburagi,gulbarga` | First-time visitors from these cities (Vercel `x-vercel-ip-city`) open in Kannada |
| `WHATSAPP_TEMPLATE_LANGUAGES` | `en` (later `en,kn,hi`) | Languages whose templates are approved; others fall back to the first |
| `RESEND_API_KEY` / `EMAIL_FROM` | From Resend; `Eventzo <noreply@your-domain>` | Booking, payment and RSVP emails. **Server-only** key |

**Sending within a minute (any Vercel plan):** Supabase `pg_cron` checks the outbox every minute and, only when messages are waiting, calls `/api/cron/notifications` through `pg_net`. It needs two Supabase Vault secrets (SQL Editor, once):

```sql
select vault.create_secret('https://<your-domain>', 'eventzo_site_url');
select vault.create_secret('<the same value as CRON_SECRET>', 'eventzo_cron_secret');
```

The daily Vercel Cron in `vercel.json` stays as a backstop. Holds and payment expiry don't depend on either; they run in `pg_cron`.

**Razorpay webhook:** `https://<your-domain>/api/webhooks/razorpay`, with the events listed in the README.

---

---

## 3. Connecting Razorpay, WhatsApp and email (Roadmap A1–A4)

The code for all three is finished and tested. Each switches on by itself when its settings are added in Vercel → Settings → Environment Variables (then **Redeploy**). The "Coming soon" cards change to *Test mode* / *Live* automatically.

### 3.1 Razorpay (payments and refunds)

1. Sign up at razorpay.com as a business and complete **KYC** (PAN, bank account, business proof). Razorpay checks that the website shows Terms, Privacy, Refund & Cancellation and contact details: these are in the footer (`/legal/*`); replace the `[bracketed]` items first.
2. Dashboard → **Test mode** → Account & Settings → **API Keys** → Generate. Copy the Key ID (`rzp_test_…`) and Key Secret.
3. Account & Settings → **Webhooks** → Add: URL `https://<your-domain>/api/webhooks/razorpay`; secret: any long random text; events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`.
4. In Vercel set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `PAYMENTS_SIMULATOR=false`. Redeploy.
5. Test: book as a customer → **Pay advance** → pay with Razorpay's test UPI `success@razorpay` → the booking turns **Confirmed** by itself; Admin → Payments shows it as online.
6. Live money only after the CA review (D8) and Razorpay's live activation: swap to `rzp_live_…` keys and create the same webhook in live mode.

### 3.2 WhatsApp (Meta Cloud API)

1. **Meta Business account** at business.facebook.com → Business settings → **Business verification** (GST/PAN certificate, address, website with the legal pages). Takes 1–5 days.
2. developers.facebook.com → Create app → type **Business** → add the **WhatsApp** product.
3. WhatsApp → API Setup → **Add phone number**: a number that is *not* already on WhatsApp (a new SIM or a landline that can receive a call/SMS). Set the display name **Eventzo** (Meta approves it).
4. Business settings → Users → **System users** → Add (Admin) → Assign assets: the app and the WhatsApp account (full control) → **Generate token** with permissions `whatsapp_business_messaging` and `whatsapp_business_management`, expiry **Never**. This is `WHATSAPP_ACCESS_TOKEN`.
5. WhatsApp → API Setup: copy the **Phone number ID** (not the phone number). This is `WHATSAPP_PHONE_NUMBER_ID`.
6. WhatsApp Manager → **Message templates** → create each template below: category **Utility**, language **English** (add Kannada `kn` / Hindi `hi` versions later with the same name), body exactly as shown with the variables in this order. Submit; approval usually takes minutes to a day.
7. In Vercel set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_LANGUAGES=en`, and `NOTIFICATIONS_SIMULATOR=false`. Add the two Vault secrets from section 2 if not done. Redeploy.
8. Test: on Account → Notifications add your mobile and turn WhatsApp on; send an enquiry to a test vendor whose owner has WhatsApp on → the message arrives within about a minute; Admin → Outbox shows **Sent** (or the exact Meta error).

Pricing: Meta charges per 24-hour conversation (Utility category in India is roughly ₹0.12–0.15). Add a payment method in Business settings → WhatsApp accounts → Payment settings.

| Template name | Body (English) | Variables |
|---|---|---|
| `eventzo_enquiry_new` | New enquiry for {{1}} on {{2}} | {{1}} = listing, {{2}} = date |
| `eventzo_enquiry_declined` | {{1}} declined your enquiry | {{1}} = listing |
| `eventzo_enquiry_expired` | Your hold on {{1}} expired | {{1}} = listing |
| `eventzo_enquiry_cancelled` | The customer cancelled the enquiry for {{1}} on {{2}} | {{1}} = listing, {{2}} = date |
| `eventzo_enquiry_hold_expiring` | Reply soon: the hold on {{1}} for {{2}} lapses in {{3}} hours | {{1}} = listing, {{2}} = date, {{3}} = hours |
| `eventzo_enquiry_follow_up` | Follow up today: {{1}} ({{2}}) | {{1}} = listing, {{2}} = date |
| `eventzo_quote_received` | {{1}} sent a quote for {{2}}: {{3}} | {{1}} = vendor, {{2}} = listing, {{3}} = amount |
| `eventzo_quote_accepted` | Your quote for {{1}} on {{2}} was accepted | {{1}} = listing, {{2}} = date |
| `eventzo_message_customer` | New message about {{1}} | {{1}} = listing |
| `eventzo_message_vendor` | New message from {{1}} | {{1}} = vendor |
| `eventzo_booking_new` | New booking for {{1}} on {{2}}: waiting for the advance | {{1}} = listing, {{2}} = date |
| `eventzo_booking_confirmed` | Booking confirmed: {{1}} on {{2}} | {{1}} = listing, {{2}} = date |
| `eventzo_booking_expired` | The booking for {{1}} on {{2}} lapsed (advance not paid in time) | {{1}} = listing, {{2}} = date |
| `eventzo_booking_cancelled_vendor` | {{1}} cancelled your booking on {{2}} | {{1}} = vendor, {{2}} = date |
| `eventzo_booking_cancelled_customer` | The customer cancelled the booking for {{1}} on {{2}} | {{1}} = listing, {{2}} = date |
| `eventzo_payment_received` | Payment of {{1}} received for {{2}} | {{1}} = amount, {{2}} = listing |
| `eventzo_payment_reminder` | Balance of {{1}} for {{2}} is due on {{3}} | {{1}} = amount, {{2}} = listing, {{3}} = date |
| `eventzo_refund_processed` | Refund of {{1}} for {{2}} has been issued | {{1}} = amount, {{2}} = listing |
| `eventzo_review_request` | How was {{1}}? Leave a review to help other families | {{1}} = listing |
| `eventzo_review_new` | New {{1}}★ review for {{2}} | {{1}} = rating, {{2}} = listing |
| `eventzo_review_replied` | The vendor replied to your review of {{1}} | {{1}} = listing |
| `eventzo_support_replied` | Eventzo support replied to your request #{{1}} | {{1}} = request number |
| `eventzo_support_resolved` | Your support request #{{1}} is resolved | {{1}} = request number |
| `eventzo_event_invited` | {{1}} invited you to help plan {{2}} ({role}) | {{1}} = by, {{2}} = event |
| `eventzo_rsvp_received` | {{1}} replied “{status}” for {{2}} | {{1}} = guest, {{2}} = event |
| `eventzo_job_assigned` | You have a new job: {{1}} on {{2}} | {{1}} = listing, {{2}} = date |
| `eventzo_job_cancelled` | Job cancelled: {{1}} on {{2}} | {{1}} = listing, {{2}} = date |
| `eventzo_job_declined` | {{1}} can't make it to {{2}} on {{3}} | {{1}} = guest, {{2}} = listing, {{3}} = date |
| `eventzo_vendor_suspended` | {{1}} has been suspended by Eventzo: {{2}} | {{1}} = vendor, {{2}} = reason |
| `eventzo_vendor_closed` | {{1}} has been closed by Eventzo: {{2}} | {{1}} = vendor, {{2}} = reason |
| `eventzo_vendor_reinstated` | {{1}} has been reinstated | {{1}} = vendor |
| `eventzo_vendor_changes_requested` | Eventzo asked {{1}} for changes: {{2}} | {{1}} = vendor, {{2}} = reason |
| `eventzo_vendor_rejected` | {{1}}'s verification was not approved: {{2}} | {{1}} = vendor, {{2}} = reason |
| `eventzo_vendor_verified` | {{1}} is verified by Eventzo | {{1}} = vendor |

### 3.3 Email (Resend) — also fixes sign-up emails (A4)

1. resend.com → add your domain → add the DNS records it shows (SPF, DKIM) at your domain registrar → wait for **Verified**.
2. API Keys → create a key with *Sending access*. In Vercel set `RESEND_API_KEY` and `EMAIL_FROM=Eventzo <noreply@your-domain>`. Redeploy.
3. Same account for sign-up/reset emails: Supabase → Authentication → **SMTP Settings** → enable custom SMTP: host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key, sender `noreply@your-domain`, name `Eventzo`. This removes the "powered by Supabase" sender and its rate limit.

---

## 4. Before real customers (go / no-go)

| # | Check | Owner |
|---|---|---|
| 1 | `PAYMENTS_SIMULATOR=false` and `NOTIFICATIONS_SIMULATOR=false` in Production | Dev |
| 2 | No dev seed data or `@sample.eventzo.test` logins in the production database | Dev |
| 3 | CA review of GST/TCS for the marketplace operator (D8) before live Razorpay keys | Product owner + CA |
| 4 | Cancellation policy texts reviewed by a lawyer; terms & privacy written | Product owner + legal |
| 5 | Launch city decided (D7). Mark it in *Admin → Categories & cities* | Product owner |
| 6 | Custom SMTP sending, and signup / reset / invite emails tested from the real domain | Dev |
| 7 | WhatsApp provider chosen and the 34 templates in `src/features/notifications/lib/templates.ts` approved by Meta, or keep WhatsApp off | Product owner |
| 8 | Kannada and Hindi translations reviewed by native speakers (the vendor and staff areas are English-only today) | Product owner |
| 9 | Uptime monitor on `https://<your-domain>/api/health` (UptimeRobot, Better Stack…) | Dev |
| 10 | PITR / backups on; restore tested once | Dev |
| 11 | First super admin created; staff roles granted per person (*Admin → Users*) | Product owner |
| 12 | Run the pgTAP suite against production once, read-only (each file rolls back): `npx supabase test db --remote` | Dev |

---

## 5. After each release

- CI (`.github/workflows/ci.yml`) must be green: format, lint, types, unit, PGlite migrations, then pgTAP + build + E2E on a throw-away local Supabase.
- Database changes go only through `supabase/migrations` → `npx supabase db push`. Never edit tables in the dashboard.
- Check `/api/health`, then *Admin → Payments ledger* and *Refunds* for anything stuck.

---

## 6. Security notes for operators

- **Headers:** a Content-Security-Policy (only this site, Supabase and Razorpay), `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and HSTS on https.
- **Blocking a user** (*Admin → Users*) ends their sessions and bans sign-in in Supabase Auth. An already-issued access token can still reach the API directly for up to an hour (its lifetime), but the app treats the person as signed out at once.
- **The service-role key** is used only server-side: payment webhooks and confirmations, the outbox, team invitations and user blocking.
- **Every admin action is in the audit log**, including each opening of the support view.
