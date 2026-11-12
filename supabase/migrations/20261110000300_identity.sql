-- =============================================================================
-- 0300 · Identity: profiles, roles, permissions, role assignments
-- =============================================================================

-- ---------- profiles ---------------------------------------------------------
-- One row per auth user, created automatically by the on_auth_user_created
-- trigger below. Phone is nullable now; phone OTP (D3) arrives later.
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             extensions.citext,
  full_name         text check (char_length(full_name) <= 120),
  display_name      text check (char_length(display_name) <= 60),
  phone             text check (phone ~ '^\+[1-9][0-9]{7,14}$'),   -- E.164
  phone_verified_at timestamptz,
  avatar_path       text,
  preferred_locale  public.app_locale not null default 'en',
  timezone          text not null default 'Asia/Kolkata',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index profiles_phone_key on public.profiles (phone) where phone is not null;
create index profiles_email_idx on public.profiles (email);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.profiles is 'Public-facing user profile. Auto-created on signup.';

-- ---------- roles & permissions ---------------------------------------------
create table public.roles (
  id          uuid primary key default extensions.gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z][a-z_]{1,48}$'),
  scope       public.role_scope not null,
  name        text not null,
  description text,
  is_system   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.permissions (
  id          uuid primary key default extensions.gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z_]+\.[a-z_]+$'),  -- domain.action
  description text not null,
  created_at  timestamptz not null default now()
);

create table public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (role_id, permission_id)
);

-- Platform-scope role grants (customer, super_admin, operators, support).
-- Organisation roles live on organization_members.role instead.
create table public.user_role_assignments (
  id         uuid primary key default extensions.gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role_id    uuid not null references public.roles (id) on delete restrict,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role_id)
);

create index user_role_assignments_role_idx on public.user_role_assignments (role_id);

-- Only platform-scope roles may be assigned here.
create or replace function private.assert_platform_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.roles r where r.id = new.role_id and r.scope = 'platform') then
    raise exception 'Only platform-scope roles can be assigned through user_role_assignments'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger user_role_assignments_platform_only
  before insert or update on public.user_role_assignments
  for each row execute function private.assert_platform_role();

-- ---------- reference data (real, required in every environment) ------------
insert into public.roles (code, scope, name, description) values
  ('customer',              'platform',     'Customer',              'Plans events and books vendors.'),
  ('super_admin',           'platform',     'Super admin',           'Full platform administration.'),
  ('verification_operator', 'platform',     'Verification operator', 'Reviews vendor KYC documents and listings.'),
  ('finance_operator',      'platform',     'Finance operator',      'Payments, payouts, refunds and reconciliation.'),
  ('support_agent',         'platform',     'Support agent',         'Helps customers and vendors with issues.'),
  ('owner',                 'organization', 'Owner',                 'Owns a vendor organisation.'),
  ('branch_manager',        'organization', 'Branch manager',        'Manages assigned branches of an organisation.'),
  ('staff',                 'organization', 'Staff',                 'Sees assigned jobs only.');

insert into public.permissions (code, description) values
  ('admin.access',             'Open the platform admin area'),
  ('audit.read',               'Read platform audit logs'),
  ('users.read',               'Read any user profile'),
  ('roles.manage',             'Grant and revoke platform roles'),
  ('organizations.read',       'Read any vendor organisation'),
  ('organizations.manage',     'Suspend or close vendor organisations'),
  ('verification.manage',      'Review and decide vendor verification and documents'),
  ('taxonomy.manage',          'Manage categories, cities and areas'),
  ('auspicious_dates.manage',  'Manage the muhurtham / auspicious dates calendar'),
  ('policies.manage',          'Publish terms, privacy and other policy versions'),
  ('finance.read',             'Read payments, payouts and refunds'),
  ('finance.manage',           'Issue refunds and manage payouts'),
  ('support.manage',           'Handle support tickets and disputes');

-- role → permission mapping
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on (
  (r.code = 'super_admin')
  or (r.code = 'verification_operator' and p.code in ('admin.access', 'organizations.read', 'verification.manage', 'users.read'))
  or (r.code = 'finance_operator'      and p.code in ('admin.access', 'organizations.read', 'finance.read', 'finance.manage'))
  or (r.code = 'support_agent'         and p.code in ('admin.access', 'organizations.read', 'users.read', 'support.manage'))
);

-- ---------- auth.users → profiles -------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale public.app_locale := 'en';
  v_meta_locale text := new.raw_user_meta_data ->> 'preferred_locale';
begin
  if v_meta_locale in ('en', 'kn', 'hi') then
    v_locale := v_meta_locale::public.app_locale;
  end if;

  insert into public.profiles (id, email, full_name, preferred_locale)
  values (
    new.id,
    new.email,
    nullif(left(trim(new.raw_user_meta_data ->> 'full_name'), 120), ''),
    v_locale
  );

  -- Every new account starts as a customer. Vendor access comes from
  -- organisation membership; admin roles are granted explicitly.
  insert into public.user_role_assignments (user_id, role_id)
  select new.id, r.id from public.roles r where r.code = 'customer';

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();
