-- =============================================================================
-- 0500 · Organisations (vendors), members, branches, business profile & docs
-- Organisations are created only through public.create_organization() (RPC),
-- never by a direct client insert.
-- =============================================================================

create table public.organizations (
  id                  uuid primary key default extensions.gen_random_uuid(),
  name                text not null check (char_length(trim(name)) between 2 and 120),
  slug                extensions.citext not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  legal_name          text check (char_length(legal_name) <= 200),
  primary_business_category_id uuid references public.business_categories (id) on delete set null,
  primary_city_id     uuid references public.cities (id) on delete set null,
  status              public.organization_status not null default 'draft',
  verification_status public.verification_status not null default 'unverified',
  verified_at         timestamptz,
  created_by          uuid not null references public.profiles (id) on delete restrict,
  idempotency_key     text check (char_length(idempotency_key) between 8 and 100),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (created_by, idempotency_key)
);

create index organizations_status_idx on public.organizations (status, verification_status);
create index organizations_city_idx on public.organizations (primary_city_id);

create table public.organization_members (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            public.org_role not null,
  status          public.member_status not null default 'active',
  invited_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, organization_id)
);

create index organization_members_user_idx on public.organization_members (user_id) where status = 'active';

create table public.branches (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 2 and 120),
  city_id         uuid references public.cities (id) on delete set null,
  area_id         uuid references public.areas (id) on delete set null,
  address_line1   text,
  address_line2   text,
  pincode         text check (pincode ~ '^[1-9][0-9]{5}$'),
  latitude        numeric(9, 6) check (latitude between -90 and 90),
  longitude       numeric(9, 6) check (longitude between -180 and 180),
  phone           text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  timezone        text not null default 'Asia/Kolkata',
  is_primary      boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id)
);

create index branches_org_idx on public.branches (organization_id);
create unique index branches_one_primary_per_org on public.branches (organization_id) where is_primary;

-- Branch-scoped access for branch managers and staff.
create table public.member_branch_access (
  member_id       uuid not null,
  branch_id       uuid not null,
  organization_id uuid not null,
  created_at      timestamptz not null default now(),
  primary key (member_id, branch_id),
  -- composite FKs guarantee member and branch belong to the same organisation
  foreign key (member_id, organization_id) references public.organization_members (id, organization_id) on delete cascade,
  foreign key (branch_id, organization_id) references public.branches (id, organization_id) on delete cascade
);

create index member_branch_access_branch_idx on public.member_branch_access (branch_id);

create table public.business_profiles (
  organization_id   uuid primary key references public.organizations (id) on delete cascade,
  display_name      text check (char_length(display_name) <= 120),
  tagline           text check (char_length(tagline) <= 160),
  description       text check (char_length(description) <= 5000),
  year_established  smallint check (year_established between 1900 and 2100),
  gstin             text check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  pan               text check (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  contact_email     extensions.citext,
  contact_phone     text check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_phone    text check (whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'),
  website           text check (website ~* '^https?://'),
  languages         public.app_locale[] not null default '{en}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.business_documents (
  id               uuid primary key default extensions.gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  document_type    public.business_document_type not null,
  -- object path inside the private `business-documents` bucket: {organization_id}/{uuid}.{ext}
  storage_path     text not null unique,
  file_name        text not null,
  mime_type        text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes       bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  status           public.document_status not null default 'uploaded',
  expires_on       date,
  uploaded_by      uuid not null references public.profiles (id) on delete restrict,
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (storage_path like organization_id::text || '/%')
);

create index business_documents_org_idx on public.business_documents (organization_id);
create index business_documents_review_queue_idx on public.business_documents (status) where status in ('uploaded', 'under_review');

-- updated_at triggers
create trigger organizations_set_updated_at        before update on public.organizations        for each row execute function public.set_updated_at();
create trigger organization_members_set_updated_at before update on public.organization_members for each row execute function public.set_updated_at();
create trigger branches_set_updated_at             before update on public.branches             for each row execute function public.set_updated_at();
create trigger business_profiles_set_updated_at    before update on public.business_profiles    for each row execute function public.set_updated_at();
create trigger business_documents_set_updated_at   before update on public.business_documents   for each row execute function public.set_updated_at();

-- An organisation must always keep at least one active owner.
create or replace function private.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active')
     and exists (select 1 from public.organizations o where o.id = old.organization_id)  -- skip during org cascade delete
     and not exists (
       select 1 from public.organization_members m
       where m.organization_id = old.organization_id
         and m.id <> old.id and m.role = 'owner' and m.status = 'active'
     ) then
    raise exception 'An organisation must keep at least one active owner' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger organization_members_protect_last_owner
  before update or delete on public.organization_members
  for each row execute function private.protect_last_owner();
