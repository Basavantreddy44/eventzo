-- =============================================================================
-- 0200 · Shared: enum types and the updated_at trigger
-- =============================================================================

-- ---------- updated_at -------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at with now().';

-- ---------- enums ------------------------------------------------------------
-- Supported UI locales (enhancement D). Keep in sync with src/i18n/routing.ts.
create type public.app_locale as enum ('en', 'kn', 'hi');

-- Roles live in the `roles` table; this enum only says where a role applies.
create type public.role_scope as enum ('platform', 'organization');

-- Organisation-level roles (organization_members.role).
create type public.org_role as enum ('owner', 'branch_manager', 'staff');

create type public.member_status as enum ('invited', 'active', 'suspended', 'removed');

create type public.organization_status as enum ('draft', 'pending_review', 'active', 'suspended', 'closed');

create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');

create type public.document_status as enum ('uploaded', 'under_review', 'approved', 'rejected', 'expired');

create type public.business_document_type as enum (
  'gst_certificate',
  'pan_card',
  'trade_license',
  'fssai_license',      -- catering
  'fire_noc',           -- venues
  'shop_establishment',
  'cancelled_cheque',
  'identity_proof',
  'other'
);

-- Availability (D5)
create type public.resource_kind      as enum ('venue_space', 'artist', 'team', 'equipment');
create type public.allocation_mode    as enum ('exclusive', 'capacity');
create type public.reservation_status as enum ('hold', 'confirmed', 'blocked', 'released', 'cancelled');
create type public.reservation_source as enum ('platform', 'offline', 'manual_block');

-- Enhancement G: per-service booking mode (services table arrives in Phase 3).
create type public.booking_mode as enum ('instant', 'request');

-- Governance / notifications (enhancement C)
create type public.notification_channel as enum ('email', 'sms', 'whatsapp', 'push', 'in_app');
create type public.consent_purpose      as enum ('transactional', 'marketing', 'whatsapp_updates', 'terms', 'privacy');
create type public.policy_type          as enum ('terms_of_service', 'privacy_policy', 'vendor_agreement', 'cancellation_policy', 'refund_policy');
