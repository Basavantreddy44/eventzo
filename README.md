# Eventzo

> Every Celebration, One Platform.

Multi-vendor event marketplace + vendor ERP, built as one Next.js app with three areas:

| Area | Route root | Notes |
|---|---|---|
| Customer marketplace | `/` | Public pages, prerendered |
| Vendor ERP | `/vendor/*` | Requires an organisation membership |
| Platform admin | `/admin/*` | Requires the `admin.access` permission |

Kannada and Hindi use a URL prefix (`/kn/...`, `/hi/...`); English has none.

`CLAUDE.md` is the product brief. `PROJECT_STATUS.md` tracks progress, decisions and test results. **`DEPLOYMENT.md` covers going live** (Supabase production settings, Vercel, the launch checklist).

---

## Stack

Next.js 16 (App Router, Cache Components, `src/proxy.ts`) · React 19 · TypeScript strict · Tailwind CSS 4 · shadcn/ui (Radix) · Lucide · React Hook Form + Zod 4 · next-intl 4 · Supabase (Postgres 17, Auth, RLS, Storage, pg_cron) · Vitest · pgTAP · Playwright.

---

## Prerequisites

- **Node.js ≥ 20.9** (developed on Node 24).
- **Docker Desktop** for the local Supabase stack (`npm run db:start`, `npm run db:test`). Without Docker you can still run `npm run db:check` (see [Testing](#testing)).
- A **Supabase project** for a shared or production environment.
- Optional: a **Vercel** project for deployment.

The Supabase CLI is a dev dependency, so use it through `npx supabase …` or the npm scripts below.

---

## Local setup (recommended: local Supabase stack)

```bash
npm install
npm run db:start          # starts Postgres/Auth/Storage in Docker and prints URLs + keys
npx supabase status       # shows them again at any time
cp .env.example .env.local
```

Fill `.env.local` with the values from `npx supabase status`:

| Variable | Value from `supabase status` |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API URL` (usually `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon key` (or `Publishable key`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role key` (or `Secret key`). **Server-only.** |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |

Then:

```bash
npm run db:reset          # applies supabase/migrations/* and the DEV-ONLY supabase/seed.sql
npm run dev               # http://localhost:3000
```

The local stack has email confirmation turned off (`supabase/config.toml`), so a new account is signed in immediately. Emails the local stack sends (magic links, password resets) land in Mailpit at http://127.0.0.1:54324.

### Dev seed (local only)

`npm run db:reset` loads `supabase/seed.sql`. It adds sample vendors and listings (names start with "Sample"), sample muhurtham dates and estimator ranges (labelled DEV SAMPLE), and these logins. The password for all of them is `Eventzo2027`:

| Email | Role |
|---|---|
| `admin@sample.eventzo.test` | Super admin: `/admin`, `/admin/pricing`, `/admin/muhurtham` |
| `vendor.kalaburagi@sample.eventzo.test` | Owns the Kalaburagi sample vendors (`/vendor`) |
| `vendor.bengaluru@sample.eventzo.test` | Owns the Bengaluru sample vendors |
| `customer@sample.eventzo.test` | Plain customer |

Never run `seed.sql` against a hosted project.

### Public pages

| Path | What it is |
|---|---|
| `/search` | Vendor search: text, category, guests, max price, sort |
| `/listings/<slug>` | Listing detail |
| `/muhurtham` | Muhurtham (auspicious dates) calendar |
| `/budget-estimator` | Budget estimator |

All of them also work under `/kn/...` and `/hi/...`.

---

## Credentials: exactly what is needed and where to find it

Never commit real values. `.env.local` is git-ignored.

| What | Where in the Supabase dashboard | Used for |
|---|---|---|
| **Project URL** | Project Settings → Data API → *Project URL* | `NEXT_PUBLIC_SUPABASE_URL` |
| **Anon / publishable key** | Project Settings → API Keys → *anon* (legacy) or *publishable* | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe for the browser; RLS enforces access) |
| **Service role / secret key** | Project Settings → API Keys → *service_role* (legacy) or *secret* | `SUPABASE_SERVICE_ROLE_KEY`. **Bypasses RLS.** Server-only, never `NEXT_PUBLIC_`. |
| **Project ref** | Project Settings → General → *Project ID* | `npx supabase link --project-ref <ref>` |
| **Database password** | Set when the project was created (reset under Project Settings → Database) | Prompted by `supabase link` / `db push` |
| **Personal access token** | Account (avatar) → Access Tokens | `npx supabase login` |

### Razorpay (Phase 5, optional, test mode)

Without these keys the app runs normally. The "Pay" buttons are disabled and show why, and vendors can still record cash or UPI payments. Use **test mode** keys only until the CA review (D8).

| What | Where in the Razorpay dashboard | Env var |
|---|---|---|
| **Key id** | Account & Settings → API Keys (Test Mode) | `RAZORPAY_KEY_ID` (starts with `rzp_test_`) |
| **Key secret** | Shown once when the key is generated | `RAZORPAY_KEY_SECRET`. **Server-only.** |
| **Webhook secret** | Account & Settings → Webhooks → Add webhook. URL `<site>/api/webhooks/razorpay`; events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed` | `RAZORPAY_WEBHOOK_SECRET`. **Server-only.** |

Also turn on **automatic capture** for payments (Account & Settings → Payment capture). The checkout callback is signature-verified, and the webhook confirms the same payment again; both are idempotent. To test webhooks locally, expose the dev server with a tunnel such as `ngrok`, because Razorpay can't reach `localhost`. Test cards and UPI ids are in Razorpay's test-mode docs.

### Notifications: WhatsApp & email (Phase 6, optional)

In-app notifications always work. WhatsApp and email messages are queued in an outbox (Admin → WhatsApp & email outbox) and only go out once a provider is connected. No provider is integrated yet.

| Env var | Meaning |
|---|---|
| `NOTIFICATIONS_SIMULATOR` | `true` = dev simulator: queued messages are marked "sent" without contacting anyone. **Never `true` for real customers.** |
| `CRON_SECRET` | Long random string. A scheduler (e.g. Vercel Cron) calls `GET /api/cron/notifications` with `Authorization: Bearer <secret>` to deliver the queue. Server-only. |

WhatsApp needs a Meta-approved template for each message kind. The names and variable order are in `src/features/notifications/lib/templates.ts`. Customers opt in from **My account → Notifications** (a mobile number is required), and every opt-in and opt-out is kept in `consent_records`. Guests' invitation links are shared from the host's own WhatsApp (a wa.me link), which needs no provider.

### Staff, jobs, finance & the staff app (Phase 7)

| Path | Who | What |
|---|---|---|
| `/vendor/staff` | Owners, branch managers | Roster. A staff member can be linked to a team login (invite them under **Team** first). |
| `/vendor/schedule` | Owners, branch managers | Upcoming confirmed and offline bookings with their staff. Assign people, set the call time and pay, add the venue and instructions, record payouts. |
| `/vendor/bookings/<id>` | Owners, branch managers | The same "Team for this job" card on each confirmed booking. |
| `/vendor/jobs` | Anyone with a linked staff profile | **The staff job app (H):** today's and upcoming jobs; accept, can't make it, I've arrived, mark done. |
| `/vendor/finance` | Owners, branch managers | Received, refunded, expenses, net cash, what's still owed; expense log; payments with receipt numbers; CSV downloads. |
| `/vendor/reports` | Owners, branch managers | Enquiry → quote → booking funnel, per listing, resource use, staff jobs and pay; CSV downloads. |
| `/receipts/<payment id>` | The customer, the vendor, finance | Printable payment receipt (`RCPT-2026-27-0001`, numbered per vendor per financial year). Not a GST tax invoice. |

What staff see on a job: the customer's first name, the venue and the instructions, plus their own pay. They see the customer's phone only from 2 days before to 1 day after the job. They never see emails, booking amounts or payments.

**Installing the staff app:** open `/vendor/jobs` on the phone in Chrome (Android) or Safari (iPhone), then choose *Add to Home screen*. The service worker (`public/sw.js`) keeps the last job list readable without a signal. It runs only in production builds (`npm run build && npm start`, or a deployment), never under `npm run dev`. Signing out deletes the saved copy. To regenerate the icons in `public/icons`, run `node scripts/generate-staff-icons.mjs`.

### Platform admin (Phase 8)

Admin navigation shows only the pages a role can open. The table shows the permission behind each page.

| Path | Permission (roles) | What |
|---|---|---|
| `/admin/vendors` | `organizations.read` (all staff roles); changing status needs `organizations.manage` (super admin) | Search vendors, see activity; suspend, close or reinstate with a reason. Bookings continue |
| `/admin/users` | `users.read` (super admin, verification, support); blocking needs `users.block` (super admin, support); roles need `roles.manage` (super admin) | Read-only support view (each opening is audited), block or unblock sign-in, grant or revoke platform roles |
| `/admin/taxonomy` | `taxonomy.manage` (super admin) | Categories, service types, cities, areas, with Kannada and Hindi names. Hide, never delete |
| `/admin/audit` | `audit.read` (super admin) | Every audited change, filterable, field by field |
| `/admin/payments` | `finance.read` (super admin, finance) | All payments across vendors, totals, CSV |

Blocking a user also bans the account in Supabase Auth through the service-role key. Without that key, the block still applies inside the app.

### Monitoring & CI

- `GET /api/health` returns `{"status":"ok"}` when the app can reach the database (503 otherwise). Point an uptime monitor at it.
- `.github/workflows/ci.yml` runs on every push and pull request. One job runs format, lint, types, unit tests and PGlite migrations. A second job runs pgTAP, the build and E2E against a throw-away local Supabase on the runner, never a hosted project.

### Linking and migrating a hosted project

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npm run db:push           # applies supabase/migrations to the hosted DB (never run seed.sql there)
```

Do not create or alter tables in the dashboard. Every schema change is a new file in `supabase/migrations`.

### Hosted Auth settings (Dashboard → Authentication)

- **URL Configuration:**
  - *Site URL* = your app URL.
  - *Redirect URLs* include `http://localhost:3000/**` and `https://<your-vercel-domain>/**`.
- **Email provider:**
  - Keep *Confirm email* **on** in production.
  - Configure custom SMTP before launch; Supabase's built-in sender is rate-limited.
- **Password policy:** minimum 8 characters, letters + digits (matches `supabase/config.toml` and the Zod schema).
- **Email templates:** the defaults work with `/auth/callback` (PKCE). For links that work across devices, point templates at `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<signup|recovery|magiclink>&next=/account`.

### Invitation email template (team invites)

Vendor owners invite team members by email. The local stack uses `supabase/templates/invite.html` (set in `supabase/config.toml`). On a hosted project, paste the same HTML into **Authentication → Email Templates → Invite user**. It links to `/auth/confirm?token_hash=…&type=invite&next=/reset-password`, so the invitee signs in, sets a password and then accepts the invitation on **My account**.

### Granting the first super admin

New accounts get only the `customer` role. Run this in the SQL editor, once per environment:

```sql
insert into public.user_role_assignments (user_id, role_id)
select u.id, r.id
from auth.users u, public.roles r
where u.email = 'you@example.com' and r.code = 'super_admin';
```

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm run lint` · `typecheck` · `format` | ESLint · `next typegen` + `tsc` · Prettier |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run test:e2e` | Playwright (`tests/e2e`). Needs the local Supabase stack running; starts `next dev` itself. Run `npx playwright install` once. |
| `npm run db:start` / `db:stop` | Start or stop the local Supabase stack (Docker) |
| `npm run db:reset` | Recreate the local DB from migrations + dev seed |
| `npm run db:test` | **pgTAP** RLS and DB tests via `supabase test db` (Docker) |
| `npm run db:check` | Docker-free check: migrations + pgTAP on PGlite (Postgres 17 WASM) with a minimal Supabase stand-in. A quick check, **not** a replacement for `db:test`. |
| `npm run db:types` | Generate TypeScript types from the local DB into `src/types/database.generated.ts` |
| `npm run db:push` | Push migrations to the linked hosted project |

---

## Testing

| Layer | Tool | Location |
|---|---|---|
| RLS, constraints, RPCs | pgTAP | `supabase/tests/database/*.test.sql` (shared helpers in `00_helpers.sql.inc`) |
| Schemas, permission helpers, utils | Vitest | `tests/unit/*.test.ts` |
| Auth flows and route protection | Playwright | `tests/e2e/*.spec.ts` |

For a reliable E2E run (sign-off, CI), test the production build. A cold `next dev` can flake under parallel load.

```powershell
npm run build; npx next start -p 3200
# second terminal:
$env:PLAYWRIGHT_BASE_URL="http://localhost:3200"; npm run test:e2e
```

E2E tests create real users and vendors in the local database; run `npm run db:reset` for a clean slate. They use 2 browser workers by default, because more saturates a small laptop running the full Supabase stack. Set `$env:PW_WORKERS=4` on a bigger machine or in CI.

---

## Project layout

```
src/
  app/
    [locale]/                 root layout (html lang, fonts, i18n provider)
      (marketplace)/          public shell: home, become-a-vendor
      (auth)/                 login, register, forgot/reset password, check-email
      account/ vendor/ admin/ portal shells; each has error/loading/not-found
    auth/callback, auth/confirm   non-localised auth route handlers
  proxy.ts                    session refresh + locale routing + coarse sign-in gate
  components/                 shared UI (ui/, layout/, states/, data-table, status-badge, …)
  features/<domain>/          actions/ components/ queries/ schemas/ lib/
  i18n/                       routing, request config, navigation helpers
  lib/                        supabase clients, auth/session + permissions, env, money, errors
messages/                     en.json (source of truth), kn.json, hi.json
supabase/
  migrations/                 numbered SQL migrations (the only way to change the schema)
  seed.sql                    DEV-ONLY sample data
  tests/database/             pgTAP
tests/unit, tests/e2e
```

### Security model (summary)

1. **RLS is always on.** Every table has explicit grants and policies; `05_rls_coverage.test.sql` fails if a table is missing either.
2. **Server checks next.** Server Actions and layouts re-verify the session (`getClaims`) and permissions (`my_access()` RPC).
3. **UI hiding is cosmetic only.**

Multi-row writes (create organisation, reserve a resource) go through `SECURITY DEFINER` RPCs. Clients never insert into `organizations` or `resource_reservations` directly.
