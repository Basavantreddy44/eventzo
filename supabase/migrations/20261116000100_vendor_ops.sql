-- =============================================================================
-- Phase 7 · Advanced vendor ERP
--   staff_profiles    – the vendor's roster (with or without an Eventzo login)
--   jobs              – one per confirmed booking item or offline booking
--   job_assignments   – staff on a job; an artist's own resource is reserved
--   vendor_expenses   – expense log (incl. staff payouts)
--   payments.receipt_number – per-vendor, per-financial-year payment receipts
--   my_jobs / respond_job   – the staff job app (H)
--   vendor_report           – reports, scoped to the caller's branches (owner: all)
-- Decisions (product owner, 12 Nov 2026): roster + optional login; staff see
-- the customer's first name and venue, and the phone only from 2 days before
-- to 1 day after the job; receivables + expenses + receipts (not GST tax
-- invoices); installable staff app with an offline copy of the job list.
-- =============================================================================

create type public.job_assignment_status as enum ('assigned', 'accepted', 'declined', 'checked_in', 'completed', 'cancelled');
create type public.expense_category as enum (
  'staff_payout', 'materials', 'food_supplies', 'decor_supplies', 'transport',
  'rent', 'utilities', 'equipment', 'marketing', 'fees', 'other'
);

-- ---------- staff roster -----------------------------------------------------------------
create table public.staff_profiles (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id       uuid,
  member_id       uuid references public.organization_members (id) on delete set null,
  full_name       text not null check (char_length(trim(full_name)) between 1 and 120),
  phone           text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  skill           text check (char_length(skill) <= 80),
  day_rate_paise  bigint check (day_rate_paise between 0 and 100000000),
  currency        char(3) not null default 'INR',
  notes           text check (char_length(notes) <= 1000),
  active          boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id) on delete set null (branch_id)
);
create index staff_profiles_org_idx on public.staff_profiles (organization_id, active);
create unique index staff_profiles_member_key on public.staff_profiles (member_id) where member_id is not null;

alter table public.bookable_resources
  add constraint bookable_resources_staff_profile_fk
  foreign key (staff_profile_id, organization_id) references public.staff_profiles (id, organization_id)
  on delete set null (staff_profile_id);
create unique index bookable_resources_staff_key on public.bookable_resources (staff_profile_id) where staff_profile_id is not null;

-- A linked login must belong to the same organisation.
create or replace function private.prepare_staff_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.full_name := trim(new.full_name);
  new.skill := nullif(trim(new.skill), '');
  new.notes := nullif(trim(new.notes), '');
  if new.member_id is not null and not exists (
    select 1 from public.organization_members m
    where m.id = new.member_id and m.organization_id = new.organization_id) then
    raise exception 'That login is not a member of this business' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- A resource can only be linked to staff of the same organisation (FK) who is active.
create or replace function private.guard_resource_staff_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.staff_profile_id is not null and (tg_op = 'INSERT' or new.staff_profile_id is distinct from old.staff_profile_id) then
    if new.kind not in ('artist', 'team') then
      raise exception 'Only artist or team resources can be linked to staff' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger staff_profiles_prepare before insert or update on public.staff_profiles
  for each row execute function private.prepare_staff_profile();
create trigger staff_profiles_set_updated_at before update on public.staff_profiles
  for each row execute function public.set_updated_at();
create trigger audit_staff_profiles after insert or update or delete on public.staff_profiles
  for each row execute function private.audit_row_change();
create trigger bookable_resources_staff_link before insert or update on public.bookable_resources
  for each row execute function private.guard_resource_staff_link();

-- ---------- jobs & assignments -------------------------------------------------------------
create table public.jobs (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id       uuid,
  booking_item_id uuid unique references public.booking_items (id) on delete cascade,
  reservation_id  uuid unique references public.resource_reservations (id) on delete cascade,
  period          tstzrange not null,
  title           text not null check (char_length(title) between 1 and 200),
  status          text not null default 'active' check (status in ('active', 'cancelled')),
  site_address    text check (char_length(site_address) <= 500),
  instructions    text check (char_length(instructions) <= 2000),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id),
  check (num_nonnulls(booking_item_id, reservation_id) = 1)
);
create index jobs_org_period_idx on public.jobs using gist (organization_id, period);

create table public.job_assignments (
  id                   uuid primary key default extensions.gen_random_uuid(),
  job_id               uuid not null,
  organization_id      uuid not null,
  staff_profile_id     uuid not null,
  role_label           text check (char_length(role_label) <= 80),
  call_time            timestamptz,
  pay_paise            bigint check (pay_paise between 0 and 100000000),
  status               public.job_assignment_status not null default 'assigned',
  staff_note           text check (char_length(staff_note) <= 500),
  staff_reservation_id uuid references public.resource_reservations (id) on delete set null,
  assigned_by          uuid references public.profiles (id) on delete set null,
  responded_at         timestamptz,
  checked_in_at        timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (job_id, organization_id) references public.jobs (id, organization_id) on delete cascade,
  foreign key (staff_profile_id, organization_id) references public.staff_profiles (id, organization_id) on delete restrict
);
create unique index job_assignments_active_key on public.job_assignments (job_id, staff_profile_id)
  where status not in ('declined', 'cancelled');
create index job_assignments_staff_idx on public.job_assignments (staff_profile_id, status);
create index job_assignments_job_idx on public.job_assignments (job_id);

create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create trigger job_assignments_set_updated_at before update on public.job_assignments
  for each row execute function public.set_updated_at();
create trigger audit_jobs after insert or update or delete on public.jobs
  for each row execute function private.audit_row_change();
create trigger audit_job_assignments after insert or update or delete on public.job_assignments
  for each row execute function private.audit_row_change();

-- ---------- expenses ------------------------------------------------------------------------
create table public.vendor_expenses (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id       uuid,
  category        public.expense_category not null,
  amount_paise    bigint not null check (amount_paise between 1 and 10000000000),
  currency        char(3) not null default 'INR',
  spent_on        date not null,
  payee           text check (char_length(payee) <= 120),
  mode            public.offline_payment_mode,
  reference       text check (char_length(reference) <= 200),
  note            text check (char_length(note) <= 500),
  booking_item_id uuid references public.booking_items (id) on delete set null,
  job_id          uuid references public.jobs (id) on delete set null,
  assignment_id   uuid unique references public.job_assignments (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  idempotency_key text check (char_length(idempotency_key) between 8 and 100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id) on delete set null (branch_id)
);
create index vendor_expenses_org_idx on public.vendor_expenses (organization_id, spent_on desc);
create index vendor_expenses_item_idx on public.vendor_expenses (booking_item_id) where booking_item_id is not null;

-- Links must stay inside the organisation; a staff payout copies its job and booking.
create or replace function private.prepare_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.job_assignments%rowtype;
  j public.jobs%rowtype;
begin
  if new.spent_on < date '2000-01-01' or new.spent_on > (now() at time zone 'Asia/Kolkata')::date + 366 then
    raise exception 'Expense date is out of range' using errcode = '22023';
  end if;
  new.payee := nullif(trim(new.payee), '');
  new.reference := nullif(trim(new.reference), '');
  new.note := nullif(trim(new.note), '');

  if new.assignment_id is not null then
    select * into a from public.job_assignments where id = new.assignment_id;
    if not found or a.organization_id <> new.organization_id then
      raise exception 'Assignment not found' using errcode = '23514';
    end if;
    new.category := 'staff_payout';
    new.job_id := a.job_id;
  end if;
  if new.job_id is not null then
    select * into j from public.jobs where id = new.job_id;
    if not found or j.organization_id <> new.organization_id then
      raise exception 'Job not found' using errcode = '23514';
    end if;
    new.booking_item_id := coalesce(j.booking_item_id, new.booking_item_id);
    new.branch_id := coalesce(new.branch_id, j.branch_id);
  end if;
  if new.booking_item_id is not null and not exists (
    select 1 from public.booking_items b where b.id = new.booking_item_id and b.organization_id = new.organization_id) then
    raise exception 'Booking not found' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger vendor_expenses_prepare before insert or update on public.vendor_expenses
  for each row execute function private.prepare_expense();
create trigger vendor_expenses_set_updated_at before update on public.vendor_expenses
  for each row execute function public.set_updated_at();
create trigger audit_vendor_expenses after insert or update or delete on public.vendor_expenses
  for each row execute function private.audit_row_change();

-- ---------- payment receipts ------------------------------------------------------------------
-- Each vendor numbers its receipts per Indian financial year (April–March, IST):
-- RCPT-2026-27-0001. Assigned once, when a payment becomes paid. These are
-- payment receipts, not GST tax invoices (D8: invoices wait for the CA review).
alter table public.payments add column receipt_number text;
create unique index payments_receipt_key on public.payments (organization_id, receipt_number) where receipt_number is not null;

create table private.receipt_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  fiscal_year     text not null,
  last_number     int not null default 0,
  primary key (organization_id, fiscal_year)
);

create or replace function private.fiscal_year(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(month from (p_at at time zone 'Asia/Kolkata')) >= 4
      then extract(year from (p_at at time zone 'Asia/Kolkata'))::int::text || '-'
           || lpad(((extract(year from (p_at at time zone 'Asia/Kolkata'))::int + 1) % 100)::text, 2, '0')
    else (extract(year from (p_at at time zone 'Asia/Kolkata'))::int - 1)::text || '-'
           || lpad((extract(year from (p_at at time zone 'Asia/Kolkata'))::int % 100)::text, 2, '0')
  end;
$$;

create or replace function private.next_receipt_number(p_organization_id uuid, p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fy text := private.fiscal_year(p_at);
  v_n  int;
begin
  insert into private.receipt_counters as c (organization_id, fiscal_year, last_number)
  values (p_organization_id, v_fy, 1)
  on conflict (organization_id, fiscal_year) do update set last_number = c.last_number + 1
  returning last_number into v_n;
  return 'RCPT-' || v_fy || '-' || lpad(v_n::text, 4, '0');
end;
$$;

create or replace function private.assign_receipt_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid' and new.receipt_number is null then
    new.receipt_number := private.next_receipt_number(new.organization_id, coalesce(new.paid_at, now()));
  end if;
  return new;
end;
$$;

create trigger payments_receipt_number before insert or update of status on public.payments
  for each row execute function private.assign_receipt_number();

-- Backfill payments that were already paid, in payment order.
do $$
declare
  p record;
begin
  for p in select id, organization_id, coalesce(paid_at, created_at) as at from public.payments
           where status = 'paid' and receipt_number is null order by coalesce(paid_at, created_at), id
  loop
    update public.payments set receipt_number = private.next_receipt_number(p.organization_id, p.at) where id = p.id;
  end loop;
end;
$$;

-- ---------- access helpers ------------------------------------------------------------------
-- Owners see every staff member; branch managers see business-wide staff and
-- staff of their branches (so they can staff their jobs). The linked person
-- always sees their own profile.
create or replace function private.can_view_staff(p_organization_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_org_role(p_organization_id, array['owner'])
      or (public.has_org_role(p_organization_id, array['branch_manager'])
          and (p_branch_id is null or public.can_access_branch(p_branch_id)));
$$;

create or replace function private.is_my_staff_profile(p_staff_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles s
    join public.organization_members m on m.id = s.member_id
    where s.id = p_staff_profile_id and m.user_id = (select auth.uid()) and m.status = 'active');
$$;

create or replace function private.can_manage_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.jobs j where j.id = p_job_id
                 and private.can_manage_resource(j.organization_id, j.branch_id));
$$;

-- ---------- RLS ------------------------------------------------------------------------------
alter table public.staff_profiles  enable row level security;
alter table public.jobs            enable row level security;
alter table public.job_assignments enable row level security;
alter table public.vendor_expenses enable row level security;
alter table private.receipt_counters enable row level security;

revoke all on public.staff_profiles, public.jobs, public.job_assignments, public.vendor_expenses from anon, authenticated;
revoke all on private.receipt_counters from anon, authenticated;

grant select on public.staff_profiles to authenticated;
grant insert (organization_id, branch_id, member_id, full_name, phone, skill, day_rate_paise, notes, active, created_by)
  on public.staff_profiles to authenticated;
grant update (branch_id, member_id, full_name, phone, skill, day_rate_paise, notes, active)
  on public.staff_profiles to authenticated;

create policy staff_profiles_select on public.staff_profiles for select to authenticated
  using (private.can_view_staff(organization_id, branch_id) or private.is_my_staff_profile(id));
create policy staff_profiles_insert on public.staff_profiles for insert to authenticated
  with check (private.can_manage_resource(organization_id, branch_id) and created_by = (select auth.uid()));
create policy staff_profiles_update on public.staff_profiles for update to authenticated
  using (private.can_manage_resource(organization_id, branch_id))
  with check (private.can_manage_resource(organization_id, branch_id));

-- Jobs: managers read; only the job's site & instructions are directly editable.
grant select on public.jobs to authenticated;
grant update (site_address, instructions) on public.jobs to authenticated;
create policy jobs_select on public.jobs for select to authenticated
  using (private.can_manage_resource(organization_id, branch_id));
create policy jobs_update on public.jobs for update to authenticated
  using (private.can_manage_resource(organization_id, branch_id) and status = 'active')
  with check (private.can_manage_resource(organization_id, branch_id));

-- Assignments: managers and the assigned person read; every write goes through RPCs.
grant select on public.job_assignments to authenticated;
create policy job_assignments_select on public.job_assignments for select to authenticated
  using (private.can_manage_job(job_id) or private.is_my_staff_profile(staff_profile_id));

-- Expenses: owners for everything, branch managers for their branches.
grant select, delete on public.vendor_expenses to authenticated;
grant insert (organization_id, branch_id, category, amount_paise, spent_on, payee, mode, reference, note,
              booking_item_id, job_id, assignment_id, created_by, idempotency_key)
  on public.vendor_expenses to authenticated;
grant update (branch_id, category, amount_paise, spent_on, payee, mode, reference, note, booking_item_id)
  on public.vendor_expenses to authenticated;
create policy vendor_expenses_select on public.vendor_expenses for select to authenticated
  using (private.can_manage_resource(organization_id, branch_id));
create policy vendor_expenses_insert on public.vendor_expenses for insert to authenticated
  with check (private.can_manage_resource(organization_id, branch_id) and created_by = (select auth.uid()));
create policy vendor_expenses_update on public.vendor_expenses for update to authenticated
  using (private.can_manage_resource(organization_id, branch_id))
  with check (private.can_manage_resource(organization_id, branch_id));
create policy vendor_expenses_delete on public.vendor_expenses for delete to authenticated
  using (private.can_manage_resource(organization_id, branch_id));

create policy receipt_counters_none on private.receipt_counters for select to authenticated using (false);

-- ---------- jobs: creation & cancellation ------------------------------------------------------
-- The job for a confirmed booking item or an offline booking (created on first use).
create or replace function public.ensure_job(p_booking_item_id uuid default null, p_reservation_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b    public.booking_items%rowtype;
  r    public.resource_reservations%rowtype;
  res  public.bookable_resources%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if num_nonnulls(p_booking_item_id, p_reservation_id) <> 1 then
    raise exception 'Give a booking or an offline booking' using errcode = '22023';
  end if;

  if p_booking_item_id is not null then
    select * into b from public.booking_items where id = p_booking_item_id;
    if not found or not private.can_manage_resource(b.organization_id, b.branch_id) then
      raise exception 'Booking not found' using errcode = 'P0002';
    end if;
    select id into v_id from public.jobs where booking_item_id = b.id;
    if v_id is not null then
      return v_id;
    end if;
    if b.status <> 'confirmed' then
      raise exception 'Only confirmed bookings can be staffed' using errcode = '22023';
    end if;
    insert into public.jobs (organization_id, branch_id, booking_item_id, period, title, created_by)
    values (b.organization_id, b.branch_id, b.id, b.period,
            left(coalesce(b.snapshot #>> '{listing,title}', 'Booking'), 200), auth.uid())
    on conflict (booking_item_id) do nothing
    returning id into v_id;
    return coalesce(v_id, (select id from public.jobs where booking_item_id = b.id));
  end if;

  select * into r from public.resource_reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reservation not found' using errcode = 'P0002';
  end if;
  select * into res from public.bookable_resources where id = r.resource_id;
  if not private.can_manage_resource(res.organization_id, res.branch_id) then
    raise exception 'Reservation not found' using errcode = 'P0002';
  end if;
  select id into v_id from public.jobs where reservation_id = r.id;
  if v_id is not null then
    return v_id;
  end if;
  if r.source <> 'offline' or r.status <> 'confirmed' then
    raise exception 'Only offline bookings can be staffed this way' using errcode = '22023';
  end if;
  insert into public.jobs (organization_id, branch_id, reservation_id, period, title, instructions, created_by)
  values (r.organization_id, res.branch_id, r.id, r.period, left(res.name, 200), r.notes, auth.uid())
  on conflict (reservation_id) do nothing
  returning id into v_id;
  return coalesce(v_id, (select id from public.jobs where reservation_id = r.id));
end;
$$;

-- Cancels a job: active assignments end and staff reservations are released.
create or replace function private.cancel_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
begin
  update public.jobs set status = 'cancelled' where id = p_job_id and status = 'active';
  for a in
    update public.job_assignments ja
       set status = 'cancelled', cancelled_at = now()
     where ja.job_id = p_job_id and ja.status in ('assigned', 'accepted', 'checked_in')
    returning ja.id, ja.staff_profile_id, ja.staff_reservation_id
  loop
    if a.staff_reservation_id is not null then
      update public.resource_reservations set status = 'released'
       where id = a.staff_reservation_id and status in ('hold', 'confirmed', 'blocked');
    end if;
    perform private.notify_staff(a.staff_profile_id, 'job.cancelled', p_job_id);
  end loop;
end;
$$;

-- In-app (and, with consent, WhatsApp) notification for the staff member's login.
create or replace function private.notify_staff(p_staff_profile_id uuid, p_kind text, p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  j      public.jobs%rowtype;
begin
  select m.user_id into v_user from public.staff_profiles s
  join public.organization_members m on m.id = s.member_id and m.status = 'active'
  where s.id = p_staff_profile_id;
  if v_user is null then
    return;
  end if;
  select * into j from public.jobs where id = p_job_id;
  perform private.notify(v_user, 'bookings', p_kind,
    jsonb_build_object('listing', j.title,
                       'date', to_char(lower(j.period) at time zone 'Asia/Kolkata', 'DD Mon YYYY')),
    '/vendor/jobs');
end;
$$;

create or replace function private.booking_item_jobs_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job uuid;
begin
  if new.status in ('cancelled', 'expired') and old.status is distinct from new.status then
    select id into v_job from public.jobs where booking_item_id = new.id;
    if v_job is not null then
      perform private.cancel_job(v_job);
    end if;
  end if;
  return null;
end;
$$;

create or replace function private.reservation_jobs_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job uuid;
begin
  if new.status in ('released', 'cancelled') and old.status is distinct from new.status then
    select id into v_job from public.jobs where reservation_id = new.id;
    if v_job is not null then
      perform private.cancel_job(v_job);
    end if;
  end if;
  return null;
end;
$$;

create trigger booking_items_jobs_sync after update of status on public.booking_items
  for each row execute function private.booking_item_jobs_sync();
create trigger resource_reservations_jobs_sync after update of status on public.resource_reservations
  for each row execute function private.reservation_jobs_sync();

-- ---------- assignments --------------------------------------------------------------------------
create or replace function public.assign_staff(
  p_job_id           uuid,
  p_staff_profile_id uuid,
  p_role_label       text default null,
  p_call_time        timestamptz default null,
  p_pay_paise        bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  j        public.jobs%rowtype;
  s        public.staff_profiles%rowtype;
  v_res    public.bookable_resources%rowtype;
  v_anchor uuid;
  v_rsv    public.resource_reservations%rowtype;
  v_rsv_id uuid;
  v_id     uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into j from public.jobs where id = p_job_id;
  if not found or not private.can_manage_resource(j.organization_id, j.branch_id) then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  if j.status <> 'active' then
    raise exception 'This job was cancelled' using errcode = '22023';
  end if;
  if upper(j.period) <= now() then
    raise exception 'This job has already finished' using errcode = '22023';
  end if;

  -- Lock the staff row: concurrent assignments of the same person serialise here.
  select * into s from public.staff_profiles where id = p_staff_profile_id for update;
  if not found or s.organization_id <> j.organization_id or not s.active then
    raise exception 'Staff member not found' using errcode = 'P0002';
  end if;
  if s.branch_id is not null and j.branch_id is not null and s.branch_id <> j.branch_id then
    raise exception 'This staff member works at another branch' using errcode = '22023';
  end if;
  if p_call_time is not null
     and (p_call_time < lower(j.period) - interval '1 day' or p_call_time > upper(j.period)) then
    raise exception 'Call time must be within a day before the job' using errcode = '22023';
  end if;
  if exists (select 1 from public.job_assignments where job_id = j.id and staff_profile_id = s.id
             and status not in ('declined', 'cancelled')) then
    raise exception 'Already assigned to this job' using errcode = '23505';
  end if;

  -- Nobody can be in two places at once.
  if exists (
    select 1 from public.job_assignments a
    join public.jobs oj on oj.id = a.job_id
    where a.staff_profile_id = s.id and a.status in ('assigned', 'accepted', 'checked_in')
      and oj.status = 'active' and oj.period && j.period) then
    raise exception 'This staff member already has a job at that time' using errcode = '23P01';
  end if;

  -- An artist with their own calendar resource is reserved too, so customers
  -- can't book them for the same time (unless the booking already reserved it).
  select * into v_res from public.bookable_resources where staff_profile_id = s.id and active;
  if found then
    if j.booking_item_id is not null then
      select r.resource_id into v_anchor from public.booking_items b
      join public.resource_reservations r on r.id = b.reservation_id where b.id = j.booking_item_id;
    else
      select resource_id into v_anchor from public.resource_reservations where id = j.reservation_id;
    end if;
    if v_anchor is distinct from v_res.id then
      v_rsv := private.reserve_core(
        v_res.id, j.period, 'confirmed',
        case when j.booking_item_id is not null then 'platform' else 'offline' end::public.reservation_source,
        1, null, left('Staff job: ' || j.title, 1000), null, auth.uid());
      v_rsv_id := v_rsv.id;
    end if;
  end if;

  insert into public.job_assignments (job_id, organization_id, staff_profile_id, role_label, call_time, pay_paise,
                                      staff_reservation_id, assigned_by)
  values (j.id, j.organization_id, s.id, nullif(trim(p_role_label), ''), p_call_time, p_pay_paise, v_rsv_id, auth.uid())
  returning id into v_id;

  perform private.notify_staff(s.id, 'job.assigned', j.id);
  return v_id;
end;
$$;

create or replace function public.update_assignment(
  p_assignment_id uuid,
  p_role_label    text,
  p_call_time     timestamptz,
  p_pay_paise     bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.job_assignments%rowtype;
  j public.jobs%rowtype;
begin
  select * into a from public.job_assignments where id = p_assignment_id for update;
  if not found or not private.can_manage_job(a.job_id) then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  select * into j from public.jobs where id = a.job_id;
  if p_call_time is not null
     and (p_call_time < lower(j.period) - interval '1 day' or p_call_time > upper(j.period)) then
    raise exception 'Call time must be within a day before the job' using errcode = '22023';
  end if;
  if a.status in ('declined', 'cancelled') then
    raise exception 'This assignment is closed' using errcode = '22023';
  end if;
  update public.job_assignments
     set role_label = nullif(trim(p_role_label), ''), call_time = p_call_time, pay_paise = p_pay_paise
   where id = a.id;
end;
$$;

create or replace function public.unassign_staff(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.job_assignments%rowtype;
begin
  select * into a from public.job_assignments where id = p_assignment_id for update;
  if not found or not private.can_manage_job(a.job_id) then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  if a.status not in ('assigned', 'accepted', 'checked_in') then
    return;  -- already closed; idempotent
  end if;
  update public.job_assignments set status = 'cancelled', cancelled_at = now() where id = a.id;
  if a.staff_reservation_id is not null then
    update public.resource_reservations set status = 'released'
     where id = a.staff_reservation_id and status in ('hold', 'confirmed', 'blocked');
  end if;
  perform private.notify_staff(a.staff_profile_id, 'job.cancelled', a.job_id);
end;
$$;

-- The assigned person answers: accept, decline, check in, complete.
create or replace function public.respond_job(p_assignment_id uuid, p_action text, p_note text default null)
returns public.job_assignment_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  a      public.job_assignments%rowtype;
  j      public.jobs%rowtype;
  s      public.staff_profiles%rowtype;
  v_next public.job_assignment_status;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into a from public.job_assignments where id = p_assignment_id for update;
  if not found or not private.is_my_staff_profile(a.staff_profile_id) then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  select * into j from public.jobs where id = a.job_id;
  if char_length(p_note) > 500 then
    raise exception 'Note is too long' using errcode = '22001';
  end if;

  v_next := case
    when p_action = 'accept'   and a.status = 'assigned' then 'accepted'
    when p_action = 'decline'  and a.status in ('assigned', 'accepted') then 'declined'
    when p_action = 'check_in' and a.status in ('assigned', 'accepted') then 'checked_in'
    when p_action = 'complete' and a.status in ('accepted', 'checked_in') then 'completed'
  end::public.job_assignment_status;
  if v_next is null then
    if (p_action = 'accept' and a.status = 'accepted') or (p_action = 'check_in' and a.status = 'checked_in')
       or (p_action = 'complete' and a.status = 'completed') or (p_action = 'decline' and a.status = 'declined') then
      return a.status;  -- repeated tap (e.g. a retry after a bad connection)
    end if;
    raise exception 'That step is not possible now' using errcode = '22023';
  end if;
  if j.status <> 'active' then
    raise exception 'This job was cancelled' using errcode = '22023';
  end if;
  if v_next = 'checked_in' and now() < lower(j.period) - interval '1 day' then
    raise exception 'Check-in opens on the day of the job' using errcode = '22023';
  end if;
  if v_next = 'completed' and now() < lower(j.period) then
    raise exception 'The job has not started yet' using errcode = '22023';
  end if;

  update public.job_assignments
     set status        = v_next,
         staff_note    = coalesce(nullif(trim(p_note), ''), staff_note),
         responded_at  = case when v_next in ('accepted', 'declined') then now() else responded_at end,
         checked_in_at = case when v_next = 'checked_in' then now() else checked_in_at end,
         completed_at  = case when v_next = 'completed' then now() else completed_at end
   where id = a.id;

  if v_next = 'declined' then
    if a.staff_reservation_id is not null then
      update public.resource_reservations set status = 'released'
       where id = a.staff_reservation_id and status in ('hold', 'confirmed', 'blocked');
    end if;
    select * into s from public.staff_profiles where id = a.staff_profile_id;
    perform private.notify_vendor(j.organization_id, j.branch_id, 'bookings', 'job.declined',
      jsonb_build_object('guest', s.full_name, 'listing', j.title,
                         'date', to_char(lower(j.period) at time zone 'Asia/Kolkata', 'DD Mon YYYY')),
      '/vendor/schedule');
  end if;
  return v_next;
end;
$$;

-- The staff job list. Only what the job needs: the customer's first name,
-- venue and instructions; the phone only from 2 days before to 1 day after
-- the job, and only while the assignment is open. No money except own pay.
create or replace function public.my_jobs(p_from date default null, p_to date default null)
returns table (
  assignment_id     uuid,
  job_id            uuid,
  status            public.job_assignment_status,
  role_label        text,
  call_time         timestamptz,
  starts_at         timestamptz,
  ends_at           timestamptz,
  title             text,
  organization_name text,
  site              text,
  instructions      text,
  customer_name     text,
  customer_phone    text,
  guests            int,
  pay_paise         bigint,
  staff_note        text,
  job_cancelled     boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select s.id from public.staff_profiles s
    join public.organization_members m on m.id = s.member_id
    where m.user_id = (select auth.uid()) and m.status = 'active'
  ), win as (
    select coalesce(p_from, (now() at time zone 'Asia/Kolkata')::date - 7) as d_from,
           coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date + 731) as d_to  -- bookings run up to two years ahead
  )
  select a.id, j.id, a.status, a.role_label, a.call_time, lower(j.period), upper(j.period), j.title,
         o.name,
         coalesce(j.site_address, ev.venue_text,
                  case when vr.kind = 'venue_space'
                       then nullif(concat_ws(', ', br.name, br.address_line1, br.address_line2, br.pincode), '') end),
         j.instructions,
         case when b.id is not null then nullif(split_part(trim(coalesce(cp.full_name, cp.display_name, '')), ' ', 1), '') end,
         case when b.id is not null and a.status in ('assigned', 'accepted', 'checked_in') and j.status = 'active'
                   and now() between lower(j.period) - interval '2 days' and upper(j.period) + interval '1 day'
              then cp.phone end,
         b.guests, a.pay_paise, a.staff_note, j.status = 'cancelled'
  from public.job_assignments a
  join me on me.id = a.staff_profile_id
  join public.jobs j on j.id = a.job_id
  join public.organizations o on o.id = j.organization_id
  cross join win
  left join public.booking_items b on b.id = j.booking_item_id
  left join public.bookings bk on bk.id = b.booking_id
  left join public.events ev on ev.id = bk.event_id
  left join public.profiles cp on cp.id = b.customer_id
  left join public.resource_reservations rr on rr.id = coalesce(b.reservation_id, j.reservation_id)
  left join public.bookable_resources vr on vr.id = rr.resource_id
  left join public.branches br on br.id = coalesce(j.branch_id, vr.branch_id)
  where (lower(j.period) at time zone 'Asia/Kolkata')::date between win.d_from and win.d_to
    and (a.status <> 'cancelled' or a.cancelled_at > now() - interval '3 days')
  order by lower(j.period), a.call_time nulls last;
$$;

-- Staff reservations are released by unassigning, never from the calendar.
create or replace function public.release_reservation(
  p_reservation_id uuid,
  p_cancel         boolean default false,
  p_reason         text default null
)
returns public.resource_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res    public.resource_reservations%rowtype;
  r        public.bookable_resources%rowtype;
  v_result public.resource_reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_res from public.resource_reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'Reservation not found' using errcode = 'P0002';
  end if;
  select * into r from public.bookable_resources where id = v_res.resource_id;
  if not private.can_manage_resource(r.organization_id, r.branch_id) then
    raise exception 'You cannot manage this reservation' using errcode = '42501';
  end if;
  if v_res.status in ('released', 'cancelled') then
    return v_res;
  end if;
  if v_res.booking_item_id is not null
     or exists (select 1 from public.enquiries e where e.reservation_id = v_res.id
                and e.status in ('open', 'quoted', 'accepted', 'reserved')) then
    raise exception 'This reservation belongs to a customer enquiry or booking; respond to that instead' using errcode = '42501';
  end if;
  if exists (select 1 from public.job_assignments a where a.staff_reservation_id = v_res.id
             and a.status in ('assigned', 'accepted', 'checked_in')) then
    raise exception 'This time is a staff job; unassign the staff member instead' using errcode = '42501';
  end if;

  update public.resource_reservations
     set status = case when p_cancel then 'cancelled'::public.reservation_status else 'released'::public.reservation_status end,
         notes  = coalesce(nullif(trim(p_reason), ''), notes)
   where id = p_reservation_id
  returning * into v_result;
  return v_result;
end;
$$;

-- ---------- receipts ----------------------------------------------------------------------------
create or replace function public.payment_receipt(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p  public.payments%rowtype;
  b  public.booking_items%rowtype;
  o  public.organizations%rowtype;
  bp public.business_profiles%rowtype;
  br public.branches%rowtype;
  c  public.profiles%rowtype;
  v_paid_to_date bigint;
  v_refunded bigint;
begin
  select * into p from public.payments where id = p_payment_id;
  if not found or p.status <> 'paid' or not (
       p.customer_id = (select auth.uid())
       or private.can_manage_booking_item(p.booking_item_id)
       or public.has_platform_permission('finance.read')) then
    raise exception 'Receipt not found' using errcode = 'P0002';
  end if;
  select * into b from public.booking_items where id = p.booking_item_id;
  select * into o from public.organizations where id = p.organization_id;
  select * into bp from public.business_profiles where organization_id = p.organization_id;
  select * into br from public.branches where id = b.branch_id;
  if not found then
    select * into br from public.branches where organization_id = p.organization_id and is_primary limit 1;
  end if;
  select * into c from public.profiles where id = p.customer_id;
  select coalesce(sum(amount_paise), 0) into v_paid_to_date from public.payments
   where booking_item_id = b.id and status = 'paid'
     and (paid_at, id) <= (p.paid_at, p.id);
  select coalesce(sum(amount_paise), 0) into v_refunded from public.refunds
   where payment_id = p.id and status = 'processed';

  return jsonb_build_object(
    'receipt_number', p.receipt_number,
    'paid_at', p.paid_at,
    'amount_paise', p.amount_paise,
    'currency', p.currency,
    'kind', p.kind,
    'method', p.method,
    'offline_mode', p.offline_mode,
    'gateway_payment_id', p.razorpay_payment_id,
    'reference', p.reference,
    'refunded_paise', v_refunded,
    'viewer_is_customer', p.customer_id = (select auth.uid()),
    'booking', jsonb_build_object(
      'id', b.id,
      'enquiry_id', b.enquiry_id,
      'listing', b.snapshot #>> '{listing,title}',
      'event_date', b.event_date,
      'period', b.period::text,
      'total_paise', b.total_paise,
      'paid_to_date_paise', v_paid_to_date,
      'balance_after_paise', greatest(b.total_paise - v_paid_to_date, 0),
      'status', b.status),
    'vendor', jsonb_build_object(
      'name', coalesce(bp.display_name, o.name),
      'legal_name', o.legal_name,
      'gstin', bp.gstin,
      'phone', coalesce(bp.contact_phone, br.phone),
      'email', bp.contact_email,
      'address', nullif(concat_ws(', ', br.address_line1, br.address_line2, br.pincode), '')),
    'customer', jsonb_build_object(
      'name', coalesce(c.full_name, c.display_name),
      'phone', c.phone,
      'email', c.email)
  );
end;
$$;

-- ---------- reports (scoped to the caller's branches, like RLS) ------------------------------------
create or replace function public.vendor_report(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
-- Scope is decided once (owner = every branch; branch manager = their
-- branches) instead of evaluating RLS per row, and every section is a single
-- grouped pass. Same numbers a manager could read through RLS.
declare
  v_days     int;
  v_all      boolean;
  v_branches uuid[];
  v_out      jsonb;
begin
  if not public.has_org_role(p_organization_id, array['owner', 'branch_manager']) then
    raise exception 'Reports are for owners and branch managers' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 731 then
    raise exception 'Choose a range of up to two years' using errcode = '22023';
  end if;
  v_days := p_to - p_from + 1;
  v_all := public.has_org_role(p_organization_id, array['owner']);
  select coalesce(array_agg(a.branch_id), '{}') into v_branches
  from public.organization_members m
  join public.member_branch_access a on a.member_id = m.id
  where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.status = 'active';

  with
  enq as (
    select e.id, e.service_id
    from public.enquiries e
    where e.organization_id = p_organization_id
      and (v_all or e.branch_id = any (v_branches))
      and e.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
      and e.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
  ),
  items as (
    select b.service_id, b.status, b.total_paise, b.event_date
    from public.booking_items b
    where b.organization_id = p_organization_id and b.event_date between p_from and p_to
      and (v_all or b.branch_id = any (v_branches))
  ),
  pays as (
    select p.amount_paise, to_char(p.paid_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month
    from public.payments p
    join public.booking_items b on b.id = p.booking_item_id
    where p.organization_id = p_organization_id and p.status = 'paid'
      and (v_all or b.branch_id = any (v_branches))
      and p.paid_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
      and p.paid_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
  ),
  refs as (
    select r.amount_paise, to_char(r.processed_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month
    from public.refunds r
    join public.booking_items b on b.id = r.booking_item_id
    where r.organization_id = p_organization_id and r.status = 'processed'
      and (v_all or b.branch_id = any (v_branches))
      and r.processed_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
      and r.processed_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
  ),
  exps as (
    select x.amount_paise, x.category, to_char(x.spent_on, 'YYYY-MM') as month
    from public.vendor_expenses x
    where x.organization_id = p_organization_id and x.spent_on between p_from and p_to
      and (v_all or x.branch_id = any (v_branches))
  ),
  months as (
    select to_char(m, 'YYYY-MM') as month
    from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') m
  ),
  m_booked as (select to_char(event_date, 'YYYY-MM') as month, sum(total_paise) as v from items where status = 'confirmed' group by 1),
  m_pays as (select month, sum(amount_paise) as v from pays group by 1),
  m_refs as (select month, sum(amount_paise) as v from refs group by 1),
  m_exps as (select month, sum(amount_paise) as v from exps group by 1),
  quoted as (select count(distinct q.enquiry_id) as n from public.quotations q join enq on enq.id = q.enquiry_id),
  booked as (select count(distinct bi.enquiry_id) as n from public.booking_items bi join enq on enq.id = bi.enquiry_id
             where bi.status in ('confirmed', 'pending_payment')),
  l_enq as (select service_id, count(*) as n from enq group by 1),
  l_items as (select service_id, count(*) as n, sum(total_paise) as v from items where status = 'confirmed' group by 1),
  res as (
    select r.id, r.name, r.kind from public.bookable_resources r
    where r.organization_id = p_organization_id and r.active and (v_all or r.branch_id = any (v_branches))
  ),
  res_days as (
    select rr.resource_id, rr.status, count(distinct d::date) as n
    from public.resource_reservations rr
    join res on res.id = rr.resource_id
    cross join lateral generate_series(
      greatest((lower(rr.period) at time zone 'Asia/Kolkata')::date, p_from),
      least(((upper(rr.period) - interval '1 second') at time zone 'Asia/Kolkata')::date, p_to),
      interval '1 day') d
    where rr.status in ('confirmed', 'blocked')
      and rr.period && tstzrange(p_from::timestamp at time zone 'Asia/Kolkata', (p_to + 1)::timestamp at time zone 'Asia/Kolkata')
    group by 1, 2
  ),
  st as (
    select s.id, s.full_name, s.skill from public.staff_profiles s
    where s.organization_id = p_organization_id
      and (v_all or s.branch_id is null or s.branch_id = any (v_branches))
  ),
  st_jobs as (
    select a.staff_profile_id,
           count(*) filter (where a.status in ('assigned', 'accepted', 'checked_in', 'completed')) as jobs,
           count(*) filter (where a.status = 'completed') as completed,
           count(*) filter (where a.status = 'declined') as declined,
           coalesce(sum(a.pay_paise) filter (where a.status in ('assigned', 'accepted', 'checked_in', 'completed')), 0) as pay
    from public.job_assignments a
    join public.jobs j on j.id = a.job_id
    where a.organization_id = p_organization_id
      and lower(j.period) >= (p_from::timestamp at time zone 'Asia/Kolkata')
      and lower(j.period) <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
    group by 1
  ),
  st_paid as (
    select a.staff_profile_id, sum(x.amount_paise) as v
    from public.vendor_expenses x join public.job_assignments a on a.id = x.assignment_id
    where x.organization_id = p_organization_id and x.spent_on between p_from and p_to
    group by 1
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'days', v_days,
    'totals', jsonb_build_object(
      'enquiries', (select count(*) from enq),
      'quoted', (select n from quoted),
      'bookings', (select n from booked),
      'confirmed_jobs', (select count(*) from items where status = 'confirmed'),
      'booked_value_paise', (select coalesce(sum(total_paise), 0) from items where status = 'confirmed'),
      'received_paise', (select coalesce(sum(amount_paise), 0) from pays),
      'refunded_paise', (select coalesce(sum(amount_paise), 0) from refs),
      'expenses_paise', (select coalesce(sum(amount_paise), 0) from exps),
      'outstanding_paise', (select coalesce(sum(total_paise - paid_paise), 0) from public.booking_items b
                             where b.organization_id = p_organization_id and b.status = 'confirmed'
                               and b.paid_paise < b.total_paise and (v_all or b.branch_id = any (v_branches)))
    ),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object(
        'month', months.month,
        'booked_value_paise', coalesce(mb.v, 0),
        'received_paise', coalesce(mp.v, 0),
        'refunded_paise', coalesce(mr.v, 0),
        'expenses_paise', coalesce(me.v, 0)
      ) order by months.month), '[]'::jsonb)
      from months
      left join m_booked mb on mb.month = months.month
      left join m_pays mp on mp.month = months.month
      left join m_refs mr on mr.month = months.month
      left join m_exps me on me.month = months.month),
    'expenses_by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'amount_paise', total)
                                order by total desc), '[]'::jsonb)
                             from (select category, sum(amount_paise) as total from exps group by category) t),
    'listings', (select coalesce(jsonb_agg(jsonb_build_object(
        'service_id', s.id, 'title', s.title,
        'enquiries', coalesce(le.n, 0),
        'confirmed', coalesce(li.n, 0),
        'booked_value_paise', coalesce(li.v, 0)
      ) order by s.title), '[]'::jsonb)
      from public.services s
      left join l_enq le on le.service_id = s.id
      left join l_items li on li.service_id = s.id
      where s.organization_id = p_organization_id
        and (v_all or s.branch_id = any (v_branches))
        and (le.n is not null or li.n is not null or s.status = 'published')),
    'resources', (select coalesce(jsonb_agg(jsonb_build_object(
        'resource_id', res.id, 'name', res.name, 'kind', res.kind,
        'booked_days', coalesce((select n from res_days d where d.resource_id = res.id and d.status = 'confirmed'), 0),
        'blocked_days', coalesce((select n from res_days d where d.resource_id = res.id and d.status = 'blocked'), 0)
      ) order by res.name), '[]'::jsonb) from res),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object(
        'staff_profile_id', st.id, 'name', st.full_name, 'skill', st.skill,
        'jobs', coalesce(sj.jobs, 0),
        'completed', coalesce(sj.completed, 0),
        'declined', coalesce(sj.declined, 0),
        'pay_paise', coalesce(sj.pay, 0),
        'paid_out_paise', coalesce(sp.v, 0)
      ) order by st.full_name), '[]'::jsonb)
      from st
      left join st_jobs sj on sj.staff_profile_id = st.id
      left join st_paid sp on sp.staff_profile_id = st.id)
  ) into v_out;
  return v_out;
end;
$$;

-- ---------- grants ----------------------------------------------------------------------------
revoke all on function public.ensure_job(uuid, uuid) from public, anon;
revoke all on function public.assign_staff(uuid, uuid, text, timestamptz, bigint) from public, anon;
revoke all on function public.update_assignment(uuid, text, timestamptz, bigint) from public, anon;
revoke all on function public.unassign_staff(uuid) from public, anon;
revoke all on function public.respond_job(uuid, text, text) from public, anon;
revoke all on function public.my_jobs(date, date) from public, anon;
revoke all on function public.payment_receipt(uuid) from public, anon;
revoke all on function public.vendor_report(uuid, date, date) from public, anon;
grant execute on function public.ensure_job(uuid, uuid) to authenticated;
grant execute on function public.assign_staff(uuid, uuid, text, timestamptz, bigint) to authenticated;
grant execute on function public.update_assignment(uuid, text, timestamptz, bigint) to authenticated;
grant execute on function public.unassign_staff(uuid) to authenticated;
grant execute on function public.respond_job(uuid, text, text) to authenticated;
grant execute on function public.my_jobs(date, date) to authenticated;
grant execute on function public.payment_receipt(uuid) to authenticated;
grant execute on function public.vendor_report(uuid, date, date) to authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on function private.can_view_staff(uuid, uuid) to authenticated, service_role;
grant execute on function private.is_my_staff_profile(uuid) to authenticated, service_role;
grant execute on function private.can_manage_job(uuid) to authenticated, service_role;
