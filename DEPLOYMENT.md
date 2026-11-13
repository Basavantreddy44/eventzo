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

**Cron:** `vercel.json` runs `/api/cron/notifications` once a day at 03:00 UTC (08:30 IST), because Vercel's Hobby plan only allows daily cron jobs and the deploy fails otherwise. After upgrading to Pro, change the schedule back to `"*/5 * * * *"` so WhatsApp/email messages go out within minutes. Holds and payment expiry don't depend on it, because they run in Supabase `pg_cron`.

**Razorpay webhook:** `https://<your-domain>/api/webhooks/razorpay`, with the events listed in the README.

---

## 3. Before real customers (go / no-go)

| # | Check | Owner |
|---|---|---|
| 1 | `PAYMENTS_SIMULATOR=false` and `NOTIFICATIONS_SIMULATOR=false` in Production | Dev |
| 2 | No dev seed data or `@sample.eventzo.test` logins in the production database | Dev |
| 3 | CA review of GST/TCS for the marketplace operator (D8) before live Razorpay keys | Product owner + CA |
| 4 | Cancellation policy texts reviewed by a lawyer; terms & privacy written | Product owner + legal |
| 5 | Launch city decided (D7). Mark it in *Admin → Categories & cities* | Product owner |
| 6 | Custom SMTP sending, and signup / reset / invite emails tested from the real domain | Dev |
| 7 | WhatsApp provider chosen and the 23 templates in `src/features/notifications/lib/templates.ts` approved by Meta, or keep WhatsApp off | Product owner |
| 8 | Kannada and Hindi translations reviewed by native speakers (the vendor and staff areas are English-only today) | Product owner |
| 9 | Uptime monitor on `https://<your-domain>/api/health` (UptimeRobot, Better Stack…) | Dev |
| 10 | PITR / backups on; restore tested once | Dev |
| 11 | First super admin created; staff roles granted per person (*Admin → Users*) | Product owner |
| 12 | Run the pgTAP suite against production once, read-only (each file rolls back): `npx supabase test db --remote` | Dev |

---

## 4. After each release

- CI (`.github/workflows/ci.yml`) must be green: format, lint, types, unit, PGlite migrations, then pgTAP + build + E2E on a throw-away local Supabase.
- Database changes go only through `supabase/migrations` → `npx supabase db push`. Never edit tables in the dashboard.
- Check `/api/health`, then *Admin → Payments ledger* and *Refunds* for anything stuck.

---

## 5. Security notes for operators

- **Headers:** a Content-Security-Policy (only this site, Supabase and Razorpay), `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and HSTS on https.
- **Blocking a user** (*Admin → Users*) ends their sessions and bans sign-in in Supabase Auth. An already-issued access token can still reach the API directly for up to an hour (its lifetime), but the app treats the person as signed out at once.
- **The service-role key** is used only server-side: payment webhooks and confirmations, the outbox, team invitations and user blocking.
- **Every admin action is in the audit log**, including each opening of the support view.
