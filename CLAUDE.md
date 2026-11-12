# Eventzo — Project Kickoff Brief

> Every Celebration, One Platform.

This file is the single source of truth for building UtsavSetu. It combines the Project Master Instruction, the Project Blueprint v1.0 (with the Makeup & Mehendi addendum) and the decisions approved by the product owner on 10 Nov 2026. Where this file and older documents disagree, **this file wins**.

---

## 1. What we are building

A multi-vendor event marketplace plus vendor ERP, as one modular Next.js app with three areas:

| Area | Route root | Feel |
|---|---|---|
| Customer Marketplace | `/` | Premium Indian wedding & event discovery |
| Vendor ERP | `/vendor/*` | Professional business software |
| Platform Admin | `/admin/*` | Enterprise operations dashboard |

One event → many **independent** vendor bookings. Each vendor accepts, declines, or cancels its own booking item. One vendor's decision never cascades to others.

---

## 2. Approved decisions

| # | Topic | Decision |
|---|---|---|
| D1 | Backend | **Supabase only.** No Redis, no separate search engine. Holds and concurrency use PostgreSQL (exclusion constraints, row locks, transactions). Discovery uses Postgres full-text search plus indexes. |
| D2 | API style | **Server Actions + Postgres functions (RPC)** for app logic. Route handlers only where required (payment webhooks, future mobile/public API). Keep a thin service layer so REST `/api/v1` can be added later without rewriting logic. |
| D3 | Auth | **Email + password / magic link first** via Supabase Auth. Phone OTP is deferred (needs an SMS provider and DLT registration). The schema must already allow phone on profiles. |
| D4 | Launch categories | Full category taxonomy is seeded (DB-driven). **Polished UX first for: function/marriage halls & Kalyana Mantapas, catering, decoration.** Makeup, mehendi and photography follow on the same foundation. |
| D5 | Availability | **One unified model**: `bookable_resources` + `resource_reservations` covers venue spaces, artists, teams and equipment. No separate `artist_availability_slots` table. |
| D6 | Money | Integer **paise** (`bigint`) + `currency char(3) default 'INR'`. Never floats. |
| D7 | Launch city | **Decision pending: Kalaburagi (Gulbarga) or Bengaluru.** The architecture is city-agnostic (cities/areas are data). Seed data covers both. |
| D8 | Payments | Razorpay, test mode first (Phase 5). Do not claim escrow or automatic split settlement until gateway support (e.g. Route) and legal/CA review are confirmed. GST/TCS obligations for the e-commerce operator must be reviewed by a CA before Phase 5 goes live. |
| D9 | Environment | Fresh repo, fresh Supabase project, fresh Vercel project. Build from scratch. |

---

## 3. Approved enhancements & where they land

| ID | Enhancement | Foundation laid in | Feature built in |
|---|---|---|---|
| A | **Offline booking entry**: vendors log phone/walk-in bookings so the calendar stays truthful | Phase 1 (reservation `source` column) | Phase 4 |
| B | **Muhurtham-aware calendar**: auspicious dates highlighted in search, calendar and pricing | Phase 1 (`auspicious_dates` table, admin-managed data, not computed panchang) | Phase 2 (display), Phase 4 (pricing rules) |
| C | **WhatsApp-first notifications** with approved templates and opt-in consent | Phase 1 (notification channel abstraction, consent records) | Phase 6 |
| D | **Kannada + Hindi i18n** from day one | Phase 1 (`next-intl`, `en` default, `kn`/`hi` message files, no hardcoded UI strings) | Translations ongoing |
| E | **Guest list, RSVP & digital invitations** in the event workspace | Phase 6 schema | Phase 6 |
| F | **Budget estimator**: rough cost from guest count, city and categories | — | Phase 2 (simple), Phase 6 (event budget) |
| G | **Instant book vs request-to-book** per service | Phase 1 (`booking_mode` enum on services) | Phase 4–5 |
| H | **Vendor staff PWA**: installable, mobile-first job view | Phase 1 (mobile-first vendor layout) | Phase 7 |

---

## 4. Tech stack (mandatory)

- **Frontend:** Next.js (App Router), React, TypeScript strict, Tailwind CSS, shadcn/ui, Lucide, React Hook Form, Zod, TanStack Query (only where client server-state is needed), next-intl.
- **Backend:** Supabase Postgres, Auth, RLS, Storage (private buckets for documents), Realtime, Edge Functions, Postgres functions & triggers.
- **Testing:** Vitest (unit), pgTAP via `supabase test db` (RLS & DB logic), Playwright (E2E).
- **Tooling:** Supabase CLI with migrations in `supabase/migrations` (never create tables by hand in the dashboard), ESLint, Prettier, GitHub, Vercel.

---

## 5. Architecture rules

- Feature-based folders: `src/features/<domain>/{components,actions,queries,schemas,types}`.
- Shared UI lives in `src/components/` (layout, data-table, filters, status-badge, empty/loading/error states). No duplicates across portals.
- Business logic lives in server actions, services and Postgres functions, **never in React components**.
- Three Supabase clients: browser (anon key), server (cookie-based user session) and admin (service role, **server-only**, guarded by `import 'server-only'`).
- Authorization is enforced in this order: **RLS (always)**, then server-side permission checks, then UI hiding (cosmetic only).
- Never trust `organization_id` from the client. Derive it from membership.
- Category-specific fields go in typed extension tables (e.g. `venues`, `artist_profiles`) or validated JSONB attributes per category schema. Never put every field in one giant `services` table.
- Accepted quotes and policies are snapshotted onto booking items.
- Create/booking/payment operations take an `idempotency_key`.
- Timestamps are `timestamptz`, rendered in the event's local time zone (`Asia/Kolkata` default).
- Audit-log every change to availability, quotes, bookings, payments, verification and admin actions.
- No fake data presented as real features. Seed data lives only in `supabase/seed.sql` and is clearly marked dev-only.
- No decorative buttons. Every action works or is visibly disabled with a reason.

---

## 6. Unified availability model (D5)

```
bookable_resources
  id, organization_id, branch_id, kind (venue_space | artist | team | equipment),
  service_id?, staff_profile_id?, name,
  allocation_mode (exclusive | capacity), capacity int,
  setup_buffer_min, breakdown_buffer_min, travel_buffer_min, active

resource_reservations
  id, resource_id, organization_id, booking_item_id?,
  period tstzrange,          -- core time
  blocked_period tstzrange,  -- period + buffers (used for conflicts)
  status (hold | confirmed | blocked | released | cancelled),
  hold_expires_at, quantity int default 1,
  source (platform | offline | manual_block), created_by, idempotency_key
```

- **Exclusive resources:** `EXCLUDE USING gist (resource_id WITH =, blocked_period WITH &&) WHERE (status IN ('hold','confirmed','blocked'))` (requires `btree_gist`).
- **Capacity resources:** reserved via a `SECURITY DEFINER` function that takes `SELECT … FOR UPDATE` on the resource row and sums overlapping quantities inside the transaction.
- **Expired holds:** a scheduled job (pg_cron) releases them. Every check also ignores holds whose `hold_expires_at < now()`.
- **Teams:** reserve each assigned artist's resource, not just the studio.
- **Trials:** a trial is its own reservation and never auto-reserves the event day.

---

## 7. Roles

Platform roles: `customer`, `super_admin`, `verification_operator`, `finance_operator`, `support_agent`.
Organisation roles (via `organization_members`): `owner`, `branch_manager` (scoped by `member_branch_access`), `staff`.

- Customers see only their own events and bookings, plus events they are invited to.
- Staff see only assigned jobs and the minimum necessary customer details (served through a restricted view or function, not the raw customer row).
- Admin powers are split by responsibility. Every admin action is audited.

---

## 8. Phase plan

1. **Foundation** (current phase)
2. Customer marketplace & discovery (incl. B display, F simple estimator)
3. Vendor onboarding & ERP core
4. Availability, enquiries, quotations (incl. A, G)
5. Booking & payments (Razorpay test mode)
6. Multi-vendor event workspace, messaging, notifications (incl. C, E)
7. Advanced vendor ERP (staff, resources, finance, reports, H)
8. Admin & platform operations
9. Hardening: testing, security review, deployment

Every phase follows the same steps: plan, list files, implement, migrations, RLS, validation, tests, fix, update `PROJECT_STATUS.md`, list remaining work.

---

## 9. Phase 1 — Foundation: scope & definition of done

**Setup**
- `create-next-app` (TS, App Router, Tailwind, ESLint, `src/`), shadcn/ui init, Lucide, RHF, Zod, TanStack Query, next-intl, Supabase JS + SSR helpers.
- `supabase init`, local stack via `supabase start`, link to the remote project.
- `.env.example` with placeholders only:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `NEXT_PUBLIC_SITE_URL`.
- Design tokens: burgundy/wine, warm ivory, muted gold, white, charcoal. Light theme first, dark-ready.

**Migrations (Phase 1)**
1. Extensions: `pgcrypto`, `btree_gist`, `citext`, `pg_trgm`.
2. Shared: `set_updated_at()` trigger and enum types.
3. Identity: `profiles` (auto-created on signup via trigger), `roles`, `permissions`, `role_permissions`, `user_role_assignments`.
4. Organisation: `organizations`, `organization_members`, `branches`, `member_branch_access`, `business_profiles`, `business_documents` (+ private storage bucket).
5. Taxonomy: `business_categories`, `service_categories` (seeded with the full category list), `cities`, `areas`, `auspicious_dates`.
6. Governance: `audit_logs`, `consent_records`, `policy_versions`, `notification_preferences`.
7. Availability skeleton: `bookable_resources`, `resource_reservations` with the exclusion constraint (so concurrency is proven early).
8. RLS helper functions: `is_platform_admin()`, `has_platform_permission(text)`, `is_org_member(uuid)`, `has_org_role(uuid, text[])`, `can_access_branch(uuid)`. All are `SECURITY DEFINER` with a fixed `search_path`.
9. RLS enabled on **every** table, with explicit policies.

**App**
- Auth pages: login, register, forgot/reset password, email confirm callback.
- Middleware refreshes the session. Server-side guards protect `/account`, `/vendor/*` and `/admin/*` by role.
- Layouts: public marketplace shell, customer account shell, vendor ERP shell (org/branch switcher), admin shell.
- Shared components: Sidebar, Header, PageHeader, DataTable, StatusBadge, EmptyState, LoadingState, ErrorState, ConfirmDialog.
- `error.tsx`, `loading.tsx` and `not-found.tsx` per area.
- Initial dashboards show real (possibly empty) data with proper empty states. No mock numbers.
- Vendor onboarding stub: create an organisation, which becomes the owner membership (through an RPC, not a client insert).

**Tests (must pass)**
- pgTAP: a user from org A cannot read or write org B rows; a customer cannot read another customer's profile; a non-admin cannot read audit logs; overlapping exclusive reservations are rejected.
- Vitest: Zod schemas and permission helpers.
- Playwright: register, then log in; a customer is blocked from `/vendor` and `/admin`.

**Docs**
- `PROJECT_STATUS.md`: completed, pending, migrations list, known issues, test results, next step.
- `README.md`: local setup, the exact credentials needed and where to find them in Supabase.

**Out of scope for Phase 1:** listings UI, search, quotes, bookings, payments, messaging.

---

## 10. Working agreement

- Build incrementally. Never generate all modules at once.
- When something is ambiguous and architectural, **stop and ask** the product owner before deciding.
- Never invent credentials. If Supabase isn't linked yet, finish the scaffolding and list exactly what is needed.
- Never claim a phase is complete without passing tests listed in `PROJECT_STATUS.md`.
