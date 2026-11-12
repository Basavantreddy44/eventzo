-- =============================================================================
-- 0700 · Unified availability model (D5)
--   bookable_resources     – venue spaces, artists, teams, equipment
--   resource_reservations  – holds, confirmed bookings, offline bookings,
--                            manual blocks
-- Exclusive resources are protected by a GiST exclusion constraint.
-- Capacity resources are protected by public.reserve_resource() (row lock +
-- sum of overlapping quantities). See migration 1000.
-- =============================================================================

create table public.bookable_resources (
  id                   uuid primary key default extensions.gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  branch_id            uuid,
  kind                 public.resource_kind not null,
  service_id           uuid,      -- FK added in Phase 3 when `services` exists
  staff_profile_id     uuid,      -- FK added in Phase 7 when `staff_profiles` exists
  name                 text not null check (char_length(trim(name)) between 1 and 120),
  allocation_mode      public.allocation_mode not null default 'exclusive',
  capacity             int not null default 1 check (capacity between 1 and 100000),
  setup_buffer_min     int not null default 0 check (setup_buffer_min between 0 and 2880),
  breakdown_buffer_min int not null default 0 check (breakdown_buffer_min between 0 and 2880),
  travel_buffer_min    int not null default 0 check (travel_buffer_min between 0 and 2880),
  active               boolean not null default true,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id) on delete cascade,
  check (allocation_mode = 'capacity' or capacity = 1)
);

create index bookable_resources_org_idx on public.bookable_resources (organization_id, branch_id) where active;

create table public.resource_reservations (
  id              uuid primary key default extensions.gen_random_uuid(),
  resource_id     uuid not null,
  organization_id uuid not null,
  booking_item_id uuid,                               -- FK added in Phase 5 (booking_items)
  -- copied from the resource by trigger so the exclusion constraint can see it
  allocation_mode public.allocation_mode not null,
  period          tstzrange not null,
  blocked_period  tstzrange not null,                 -- period widened by buffers (set by trigger)
  status          public.reservation_status not null,
  hold_expires_at timestamptz,
  quantity        int not null default 1 check (quantity between 1 and 100000),
  source          public.reservation_source not null,
  notes           text check (char_length(notes) <= 1000),
  created_by      uuid references public.profiles (id) on delete set null,
  idempotency_key text check (char_length(idempotency_key) between 8 and 100),
  released_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (resource_id, organization_id) references public.bookable_resources (id, organization_id) on delete cascade,
  unique (organization_id, idempotency_key),

  constraint reservation_period_valid check (
    not isempty(period) and lower_inc(period) and not upper_inc(period)
    and not lower_inf(period) and not upper_inf(period)
  ),
  constraint reservation_hold_has_expiry check (status <> 'hold' or hold_expires_at is not null),
  constraint reservation_exclusive_quantity check (allocation_mode = 'capacity' or quantity = 1),
  constraint reservation_source_status check (
    (source = 'manual_block' and status in ('blocked', 'released', 'cancelled'))
    or (source = 'offline'   and status in ('confirmed', 'released', 'cancelled'))
    or (source = 'platform'  and status in ('hold', 'confirmed', 'released', 'cancelled'))
  ),

  -- The core double-booking guarantee for exclusive resources.
  constraint reservations_no_overlap_exclusive exclude using gist (
    resource_id    with =,
    blocked_period with &&
  ) where (allocation_mode = 'exclusive' and status in ('hold', 'confirmed', 'blocked'))
);

create index resource_reservations_resource_period_idx on public.resource_reservations using gist (resource_id, blocked_period);
create index resource_reservations_org_idx on public.resource_reservations (organization_id, status);
create index resource_reservations_expiring_holds_idx on public.resource_reservations (hold_expires_at) where status = 'hold';
create index resource_reservations_booking_item_idx on public.resource_reservations (booking_item_id) where booking_item_id is not null;

-- ---------- helpers & triggers ----------------------------------------------
-- blocked = [start − setup − travel, end + breakdown + travel)
create or replace function private.compute_blocked_period(
  p_period tstzrange, p_setup int, p_breakdown int, p_travel int
)
returns tstzrange
language sql
stable
set search_path = ''
as $$
  select tstzrange(
    lower(p_period) - make_interval(mins => p_setup + p_travel),
    upper(p_period) + make_interval(mins => p_breakdown + p_travel),
    '[)'
  );
$$;

create or replace function private.prepare_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.bookable_resources%rowtype;
begin
  if tg_op = 'UPDATE' and (new.resource_id <> old.resource_id or new.organization_id <> old.organization_id) then
    raise exception 'A reservation cannot be moved to another resource or organisation' using errcode = '42501';
  end if;

  select * into r from public.bookable_resources where id = new.resource_id;
  if not found then
    raise exception 'Resource % not found', new.resource_id using errcode = '23503';
  end if;

  if tg_op = 'INSERT' and not r.active then
    raise exception 'Resource is inactive' using errcode = '23514';
  end if;

  new.organization_id := r.organization_id;
  new.allocation_mode := r.allocation_mode;

  if tg_op = 'INSERT' or new.period is distinct from old.period then
    new.blocked_period := private.compute_blocked_period(
      new.period, r.setup_buffer_min, r.breakdown_buffer_min, r.travel_buffer_min);
  end if;

  if new.status in ('released', 'cancelled') and (tg_op = 'INSERT' or old.status not in ('released', 'cancelled')) then
    new.released_at := now();
  end if;
  if new.status <> 'hold' then
    new.hold_expires_at := null;
  end if;

  return new;
end;
$$;

create trigger resource_reservations_prepare
  before insert or update on public.resource_reservations
  for each row execute function private.prepare_reservation();

-- Changing a resource's allocation mode while it has active reservations would
-- silently bypass conflict rules, so it is refused.
create or replace function private.guard_resource_mode_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.allocation_mode <> old.allocation_mode and exists (
    select 1 from public.resource_reservations rr
    where rr.resource_id = old.id and rr.status in ('hold', 'confirmed', 'blocked')
  ) then
    raise exception 'Cannot change allocation mode while the resource has active reservations' using errcode = '23514';
  end if;
  if new.organization_id <> old.organization_id then
    raise exception 'A resource cannot move to another organisation' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger bookable_resources_guard_mode
  before update on public.bookable_resources
  for each row execute function private.guard_resource_mode_change();

create trigger bookable_resources_set_updated_at    before update on public.bookable_resources    for each row execute function public.set_updated_at();
create trigger resource_reservations_set_updated_at before update on public.resource_reservations for each row execute function public.set_updated_at();

create trigger audit_bookable_resources    after insert or update or delete on public.bookable_resources    for each row execute function private.audit_row_change();
create trigger audit_resource_reservations after insert or update or delete on public.resource_reservations for each row execute function private.audit_row_change();
