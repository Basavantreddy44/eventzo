-- =============================================================================
-- 1400 · Phase 4: availability, enquiries, quotations
--   (A) offline bookings / manual blocks on the vendor calendar
--   (B) muhurtham-aware pricing: optional surcharge on auspicious dates
--   (G) instant vs request-to-book
-- Decisions (product owner, 11 Nov 2026):
--   * customers must be signed in to enquire
--   * an enquiry holds the date for 48 hours, then the hold is released
--   * sending a quote / accepting a quote refreshes the hold for 48 hours
-- =============================================================================

create or replace function private.enquiry_hold_minutes()
returns int
language sql
immutable
set search_path = ''
as $$ select 2880 $$;  -- 48 hours

-- ---------- (B) auspicious-date surcharge per listing --------------------------
alter table public.services
  add column auspicious_surcharge_bps int not null default 0 check (auspicious_surcharge_bps between 0 and 10000);
grant update (auspicious_surcharge_bps) on public.services to authenticated;

-- ---------- reservation core (shared by vendor and customer paths) --------------
-- No authorisation here: callers must authorise first.
create or replace function private.reserve_core(
  p_resource_id     uuid,
  p_period          tstzrange,
  p_status          public.reservation_status,
  p_source          public.reservation_source,
  p_quantity        int,
  p_hold_minutes    int,
  p_notes           text,
  p_idempotency_key text,
  p_created_by      uuid
)
returns public.resource_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  r          public.bookable_resources%rowtype;
  v_existing public.resource_reservations%rowtype;
  v_result   public.resource_reservations%rowtype;
  v_blocked  tstzrange;
  v_used     bigint;
begin
  select * into r from public.bookable_resources where id = p_resource_id for update;
  if not found then
    raise exception 'Resource not found' using errcode = 'P0002';
  end if;
  if not r.active then
    raise exception 'Resource is inactive' using errcode = '23514';
  end if;
  if r.allocation_mode = 'exclusive' and p_quantity <> 1 then
    raise exception 'Exclusive resources are reserved one at a time' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.resource_reservations
    where organization_id = r.organization_id and idempotency_key = p_idempotency_key;
    if found then
      if v_existing.resource_id <> p_resource_id or v_existing.period <> p_period then
        raise exception 'Idempotency key was already used for a different reservation' using errcode = '22023';
      end if;
      return v_existing;
    end if;
  end if;

  -- Expired holds never block anyone.
  update public.resource_reservations
     set status = 'released'
   where resource_id = p_resource_id and status = 'hold' and hold_expires_at < now();

  v_blocked := private.compute_blocked_period(p_period, r.setup_buffer_min, r.breakdown_buffer_min, r.travel_buffer_min);
  if r.allocation_mode = 'capacity' then
    select coalesce(sum(quantity), 0) into v_used
    from public.resource_reservations
    where resource_id = p_resource_id
      and status in ('hold', 'confirmed', 'blocked')
      and not (status = 'hold' and hold_expires_at < now())
      and blocked_period && v_blocked;
    if v_used + p_quantity > r.capacity then
      raise exception 'Not enough capacity: % of % already reserved', v_used, r.capacity using errcode = '23P01';
    end if;
  end if;

  insert into public.resource_reservations (
    resource_id, organization_id, period, status, hold_expires_at, quantity, source, notes, created_by, idempotency_key
  ) values (
    p_resource_id, r.organization_id, p_period, p_status,
    case when p_status = 'hold' then now() + make_interval(mins => p_hold_minutes) end,
    p_quantity, p_source, nullif(trim(p_notes), ''), p_created_by, p_idempotency_key
  )
  returning * into v_result;   -- exclusion constraint → 23P01 for exclusive overlaps

  return v_result;
end;
$$;

-- Vendor / system path: same contract as before, now delegating to the core.
create or replace function public.reserve_resource(
  p_resource_id     uuid,
  p_starts_at       timestamptz,
  p_ends_at         timestamptz,
  p_source          public.reservation_source,
  p_status          public.reservation_status,
  p_quantity        int default 1,
  p_hold_minutes    int default null,
  p_notes           text default null,
  p_idempotency_key text default null
)
returns public.resource_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_is_system boolean := private.is_system_caller();
  r           public.bookable_resources%rowtype;
begin
  if v_uid is null and not v_is_system then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time' using errcode = '22023';
  end if;
  if p_ends_at - p_starts_at > interval '31 days' then
    raise exception 'A single reservation cannot exceed 31 days' using errcode = '22023';
  end if;
  if p_status not in ('hold', 'confirmed', 'blocked') then
    raise exception 'New reservations must be hold, confirmed or blocked' using errcode = '22023';
  end if;
  if p_status = 'hold' and (p_hold_minutes is null or p_hold_minutes not between 1 and 1440) then
    raise exception 'Holds need a duration between 1 and 1440 minutes' using errcode = '22023';
  end if;
  if coalesce(p_quantity, 0) < 1 then
    raise exception 'Quantity must be at least 1' using errcode = '22023';
  end if;

  select * into r from public.bookable_resources where id = p_resource_id;
  if not found then
    raise exception 'Resource not found' using errcode = 'P0002';
  end if;
  if not v_is_system and not private.can_manage_resource(r.organization_id, r.branch_id) then
    raise exception 'You cannot manage this resource' using errcode = '42501';
  end if;

  return private.reserve_core(p_resource_id, tstzrange(p_starts_at, p_ends_at, '[)'), p_status, p_source,
                              p_quantity, p_hold_minutes, p_notes, p_idempotency_key, v_uid);
end;
$$;

-- Is a resource free for a period (respecting buffers, capacity, live holds)?
create or replace function private.resource_free(p_resource_id uuid, p_period tstzrange, p_quantity int default 1)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when r.allocation_mode = 'exclusive' then not exists (
        select 1 from public.resource_reservations rr
        where rr.resource_id = r.id
          and rr.status in ('hold', 'confirmed', 'blocked')
          and not (rr.status = 'hold' and rr.hold_expires_at < now())
          and rr.blocked_period && private.compute_blocked_period(p_period, r.setup_buffer_min, r.breakdown_buffer_min, r.travel_buffer_min))
      else (
        select coalesce(sum(rr.quantity), 0) from public.resource_reservations rr
        where rr.resource_id = r.id
          and rr.status in ('hold', 'confirmed', 'blocked')
          and not (rr.status = 'hold' and rr.hold_expires_at < now())
          and rr.blocked_period && private.compute_blocked_period(p_period, r.setup_buffer_min, r.breakdown_buffer_min, r.travel_buffer_min)
      ) + p_quantity <= r.capacity
    end
    from public.bookable_resources r
    where r.id = p_resource_id and r.active
  ), false);
$$;

-- ---------- enquiries -------------------------------------------------------------
create type public.enquiry_status as enum (
  'open',       -- waiting for the vendor
  'quoted',     -- vendor sent a quotation
  'accepted',   -- customer accepted a quotation (booking + payment in Phase 5)
  'reserved',   -- instant-booking listing reserved at the listed price
  'declined',   -- vendor declined
  'cancelled',  -- customer cancelled
  'expired'     -- the 48-hour hold lapsed
);

create table public.enquiries (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null,
  service_id      uuid not null,
  branch_id       uuid,
  customer_id     uuid not null references public.profiles (id) on delete cascade,
  event_date      date not null,
  period          tstzrange not null,
  guests          int check (guests between 1 and 100000),
  message         text check (char_length(message) <= 2000),
  status          public.enquiry_status not null default 'open',
  booking_mode    public.booking_mode not null,
  resource_id     uuid references public.bookable_resources (id) on delete set null,
  reservation_id  uuid references public.resource_reservations (id) on delete set null,
  hold_expires_at timestamptz,
  price_snapshot  jsonb not null default '{}'::jsonb check (jsonb_typeof(price_snapshot) = 'object'),
  idempotency_key text check (char_length(idempotency_key) between 8 and 100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (service_id, organization_id) references public.services (id, organization_id) on delete cascade,
  unique (customer_id, idempotency_key)
);

create index enquiries_org_idx on public.enquiries (organization_id, status, created_at desc);
create index enquiries_customer_idx on public.enquiries (customer_id, created_at desc);
create index enquiries_hold_idx on public.enquiries (hold_expires_at) where status in ('open', 'quoted', 'accepted', 'reserved');

create table public.enquiry_messages (
  id          uuid primary key default extensions.gen_random_uuid(),
  enquiry_id  uuid not null references public.enquiries (id) on delete cascade,
  sender_id   uuid references public.profiles (id) on delete set null,
  sender_side text not null check (sender_side in ('customer', 'vendor', 'system')),
  body        text not null check (char_length(trim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index enquiry_messages_enquiry_idx on public.enquiry_messages (enquiry_id, created_at);

-- ---------- quotations -------------------------------------------------------------
create type public.quotation_status as enum ('sent', 'accepted', 'declined', 'expired', 'withdrawn', 'superseded');

create table public.quotations (
  id              uuid primary key default extensions.gen_random_uuid(),
  enquiry_id      uuid not null references public.enquiries (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version         int not null check (version >= 1),
  status          public.quotation_status not null default 'sent',
  valid_until     timestamptz not null,
  currency        char(3) not null default 'INR',
  subtotal_paise  bigint not null check (subtotal_paise >= 0),
  discount_paise  bigint not null default 0 check (discount_paise >= 0),
  tax_bps         int not null default 0 check (tax_bps between 0 and 5000),
  tax_paise       bigint not null default 0 check (tax_paise >= 0),
  total_paise     bigint not null check (total_paise >= 0),
  notes           text check (char_length(notes) <= 2000),
  terms           text check (char_length(terms) <= 4000),   -- policy snapshot shown to the customer
  created_by      uuid references public.profiles (id) on delete set null,
  sent_at         timestamptz not null default now(),
  responded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (enquiry_id, version),
  check (discount_paise <= subtotal_paise)
);

create table public.quotation_items (
  id               uuid primary key default extensions.gen_random_uuid(),
  quotation_id     uuid not null references public.quotations (id) on delete cascade,
  description      text not null check (char_length(trim(description)) between 1 and 200),
  quantity         int not null check (quantity between 1 and 100000),
  unit_price_paise bigint not null check (unit_price_paise >= 0),
  amount_paise     bigint not null check (amount_paise >= 0),
  sort_order       int not null default 0
);
create index quotation_items_quote_idx on public.quotation_items (quotation_id, sort_order);

-- Sent quotations are immutable except for their status/response.
create or replace function private.lock_sent_quotation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.subtotal_paise, new.discount_paise, new.tax_bps, new.tax_paise, new.total_paise, new.valid_until, new.notes, new.terms)
     is distinct from
     (old.subtotal_paise, old.discount_paise, old.tax_bps, old.tax_paise, old.total_paise, old.valid_until, old.notes, old.terms) then
    raise exception 'A sent quotation cannot be edited; send a new version' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger quotations_lock_sent before update on public.quotations for each row execute function private.lock_sent_quotation();

create trigger enquiries_set_updated_at  before update on public.enquiries  for each row execute function public.set_updated_at();
create trigger quotations_set_updated_at before update on public.quotations for each row execute function public.set_updated_at();
create trigger audit_enquiries      after insert or update or delete on public.enquiries      for each row execute function private.audit_row_change();
create trigger audit_quotations     after insert or update or delete on public.quotations     for each row execute function private.audit_row_change();
create trigger audit_quotation_items after insert or update or delete on public.quotation_items for each row execute function private.audit_row_change();

-- ---------- access helpers + RLS ------------------------------------------------------
-- Vendor side: owners, or branch managers of the listing's branch. Staff don't
-- see enquiries (they only see assigned jobs, Phase 7).
create or replace function private.can_manage_enquiry(p_enquiry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enquiries e
    where e.id = p_enquiry_id and private.can_manage_resource(e.organization_id, e.branch_id));
$$;

create or replace function private.can_view_enquiry(p_enquiry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.enquiries e where e.id = p_enquiry_id and e.customer_id = (select auth.uid()))
      or private.can_manage_enquiry(p_enquiry_id);
$$;

alter table public.enquiries        enable row level security;
alter table public.enquiry_messages enable row level security;
alter table public.quotations       enable row level security;
alter table public.quotation_items  enable row level security;
revoke all on public.enquiries, public.enquiry_messages, public.quotations, public.quotation_items from anon, authenticated;
grant select on public.enquiries, public.enquiry_messages, public.quotations, public.quotation_items to authenticated;

create policy enquiries_select on public.enquiries for select to authenticated
  using (customer_id = (select auth.uid()) or private.can_manage_resource(organization_id, branch_id));
create policy enquiry_messages_select on public.enquiry_messages for select to authenticated
  using (private.can_view_enquiry(enquiry_id));
create policy quotations_select on public.quotations for select to authenticated
  using (private.can_view_enquiry(enquiry_id));
create policy quotation_items_select on public.quotation_items for select to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_id and private.can_view_enquiry(q.enquiry_id)));

-- ---------- enquiry lifecycle RPCs --------------------------------------------------------
create or replace function private.release_enquiry_hold(p_enquiry_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.resource_reservations rr
     set status = 'released'
    from public.enquiries e
   where e.id = p_enquiry_id and rr.id = e.reservation_id and rr.status = 'hold';
$$;

create or replace function private.extend_enquiry_hold(p_enquiry_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until timestamptz := now() + make_interval(mins => private.enquiry_hold_minutes());
begin
  update public.resource_reservations rr
     set hold_expires_at = v_until
    from public.enquiries e
   where e.id = p_enquiry_id and rr.id = e.reservation_id and rr.status = 'hold';
  update public.enquiries set hold_expires_at = v_until where id = p_enquiry_id and reservation_id is not null;
  return v_until;
end;
$$;

/** Customer sends an enquiry (or reserves an instant-booking listing). */
create or replace function public.create_enquiry(
  p_service_id      uuid,
  p_event_date      date,
  p_start_time      time,
  p_end_time        time,
  p_guests          int,
  p_message         text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  s           public.services%rowtype;
  v_tz        text;
  v_today     date;
  v_period    tstzrange;
  v_existing  uuid;
  v_res       public.resource_reservations%rowtype;
  v_resource  uuid;
  v_has_res   boolean;
  v_auspicious boolean;
  v_id        uuid;
begin
  if v_uid is null then
    raise exception 'Please log in to send an enquiry' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;
  select id into v_existing from public.enquiries where customer_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  select sv.* into s
  from public.services sv join public.organizations o on o.id = sv.organization_id
  where sv.id = p_service_id and sv.status = 'published' and o.status = 'active';
  if not found then
    raise exception 'This listing is not available' using errcode = 'P0002';
  end if;
  if public.is_org_member(s.organization_id) then
    raise exception 'You cannot enquire with your own business' using errcode = '42501';
  end if;

  select c.timezone into v_tz from public.cities c where c.id = s.city_id;
  v_tz := coalesce(v_tz, 'Asia/Kolkata');
  v_today := (now() at time zone v_tz)::date;
  if p_event_date is null or p_event_date < v_today or p_event_date > v_today + 730 then
    raise exception 'Choose a date between today and two years from now' using errcode = '22023';
  end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'End time must be after start time' using errcode = '22023';
  end if;
  if p_guests is not null and (p_guests < 1 or (s.max_guests is not null and p_guests > s.max_guests)) then
    raise exception 'This listing hosts up to % guests', s.max_guests using errcode = '22023';
  end if;
  if (select count(*) from public.enquiries e where e.customer_id = v_uid and e.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many enquiries today' using errcode = '54000';
  end if;

  v_period := tstzrange((p_event_date + p_start_time) at time zone v_tz, (p_event_date + p_end_time) at time zone v_tz, '[)');

  -- Hold the date on the first free resource linked to this listing.
  select exists (select 1 from public.bookable_resources r where r.service_id = s.id and r.active) into v_has_res;
  if v_has_res then
    for v_resource in
      select r.id from public.bookable_resources r where r.service_id = s.id and r.active order by r.created_at
    loop
      begin
        v_res := private.reserve_core(v_resource, v_period, 'hold', 'platform', 1, private.enquiry_hold_minutes(),
                                      'Enquiry hold', null, v_uid);
        exit;
      exception when exclusion_violation then
        v_res := null;  -- taken; try the next resource
      end;
    end loop;
    if v_res.id is null then
      raise exception 'This date is not available' using errcode = '23P01';
    end if;
  end if;

  select exists (
    select 1 from public.auspicious_dates a
    where a.is_published and a.date = p_event_date and (a.city_id is null or a.city_id = s.city_id)
  ) into v_auspicious;

  insert into public.enquiries (
    organization_id, service_id, branch_id, customer_id, event_date, period, guests, message, status, booking_mode,
    resource_id, reservation_id, hold_expires_at, price_snapshot, idempotency_key
  ) values (
    s.organization_id, s.id, s.branch_id, v_uid, p_event_date, v_period, p_guests, nullif(trim(p_message), ''),
    case when s.booking_mode = 'instant' then 'reserved'::public.enquiry_status else 'open'::public.enquiry_status end,
    s.booking_mode, v_res.resource_id, v_res.id, v_res.hold_expires_at,
    jsonb_build_object(
      'title', s.title, 'slug', s.slug, 'vendor_name', (select o.name from public.organizations o where o.id = s.organization_id),
      'price_type', s.price_type, 'price_unit', s.price_unit,
      'base_price_paise', s.base_price_paise, 'max_price_paise', s.max_price_paise, 'currency', s.currency,
      'auspicious', v_auspicious, 'surcharge_bps', case when v_auspicious then s.auspicious_surcharge_bps else 0 end),
    p_idempotency_key
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.cancel_enquiry(p_enquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.enquiries
     set status = 'cancelled'
   where id = p_enquiry_id and customer_id = auth.uid() and status in ('open', 'quoted', 'accepted', 'reserved');
  if not found then
    raise exception 'Enquiry not found or already closed' using errcode = 'P0002';
  end if;
  perform private.release_enquiry_hold(p_enquiry_id);
  update public.quotations set status = 'withdrawn' where enquiry_id = p_enquiry_id and status = 'sent';
end;
$$;

create or replace function public.decline_enquiry(p_enquiry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_enquiry(p_enquiry_id) then
    raise exception 'Enquiry not found' using errcode = 'P0002';
  end if;
  update public.enquiries set status = 'declined'
   where id = p_enquiry_id and status in ('open', 'quoted', 'accepted', 'reserved');
  if not found then
    raise exception 'This enquiry is already closed' using errcode = '22023';
  end if;
  perform private.release_enquiry_hold(p_enquiry_id);
  update public.quotations set status = 'withdrawn' where enquiry_id = p_enquiry_id and status = 'sent';
  if nullif(trim(coalesce(p_reason, '')), '') is not null then
    insert into public.enquiry_messages (enquiry_id, sender_id, sender_side, body)
    values (p_enquiry_id, auth.uid(), 'vendor', left(trim(p_reason), 2000));
  end if;
end;
$$;

create or replace function public.post_enquiry_message(p_enquiry_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_side text;
  v_id   uuid;
begin
  if exists (select 1 from public.enquiries e where e.id = p_enquiry_id and e.customer_id = auth.uid()) then
    v_side := 'customer';
  elsif private.can_manage_enquiry(p_enquiry_id) then
    v_side := 'vendor';
  else
    raise exception 'Enquiry not found' using errcode = 'P0002';
  end if;
  if nullif(trim(coalesce(p_body, '')), '') is null or char_length(p_body) > 2000 then
    raise exception 'Write a message (up to 2000 characters)' using errcode = '22023';
  end if;
  if (select count(*) from public.enquiry_messages m
      where m.sender_id = auth.uid() and m.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many messages' using errcode = '54000';
  end if;
  insert into public.enquiry_messages (enquiry_id, sender_id, sender_side, body)
  values (p_enquiry_id, auth.uid(), v_side, trim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

/**
 * Vendor sends a quotation (new version; earlier sent versions are superseded).
 * p_items: [{"description": "...", "quantity": 1, "unit_price_paise": 15000000}, ...]
 * Totals are computed here, never trusted from the client. Refreshes the hold.
 */
create or replace function public.send_quotation(
  p_enquiry_id     uuid,
  p_items          jsonb,
  p_discount_paise bigint,
  p_tax_bps        int,
  p_valid_hours    int,
  p_notes          text,
  p_terms          text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e          public.enquiries%rowtype;
  v_subtotal bigint;
  v_taxable  bigint;
  v_tax      bigint;
  v_version  int;
  v_until    timestamptz;
  v_id       uuid;
  v_item     jsonb;
  v_i        int := 0;
begin
  if not private.can_manage_enquiry(p_enquiry_id) then
    raise exception 'Enquiry not found' using errcode = 'P0002';
  end if;
  select * into e from public.enquiries where id = p_enquiry_id for update;
  if e.status not in ('open', 'quoted') then
    raise exception 'Quotes can only be sent for open enquiries' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Add between 1 and 50 line items' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) it
    where nullif(trim(it ->> 'description'), '') is null
       or char_length(it ->> 'description') > 200
       or coalesce((it ->> 'quantity')::int, 0) not between 1 and 100000
       or coalesce((it ->> 'unit_price_paise')::bigint, -1) < 0
  ) then
    raise exception 'Every line needs a description, a quantity and a price' using errcode = '22023';
  end if;
  if coalesce(p_tax_bps, 0) not between 0 and 5000 or coalesce(p_discount_paise, 0) < 0
     or coalesce(p_valid_hours, 0) not between 1 and 720 then
    raise exception 'Invalid discount, tax or validity' using errcode = '22023';
  end if;

  select sum((it ->> 'quantity')::bigint * (it ->> 'unit_price_paise')::bigint) into v_subtotal
  from jsonb_array_elements(p_items) it;
  if p_discount_paise > v_subtotal then
    raise exception 'The discount cannot exceed the subtotal' using errcode = '22023';
  end if;
  v_taxable := v_subtotal - coalesce(p_discount_paise, 0);
  v_tax := round(v_taxable * coalesce(p_tax_bps, 0) / 10000.0);   -- integer paise

  update public.quotations set status = 'superseded' where enquiry_id = e.id and status = 'sent';
  select coalesce(max(version), 0) + 1 into v_version from public.quotations where enquiry_id = e.id;

  -- The date stays held while the customer considers the quote.
  v_until := coalesce(private.extend_enquiry_hold(e.id), now() + make_interval(hours => p_valid_hours));
  v_until := least(v_until, now() + make_interval(hours => p_valid_hours));
  if e.reservation_id is null then
    v_until := now() + make_interval(hours => p_valid_hours);
  end if;

  insert into public.quotations (enquiry_id, organization_id, version, status, valid_until, subtotal_paise, discount_paise,
                                 tax_bps, tax_paise, total_paise, notes, terms, created_by)
  values (e.id, e.organization_id, v_version, 'sent', v_until, v_subtotal, coalesce(p_discount_paise, 0),
          coalesce(p_tax_bps, 0), v_tax, v_taxable + v_tax, nullif(trim(p_notes), ''), nullif(trim(p_terms), ''), auth.uid())
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.quotation_items (quotation_id, description, quantity, unit_price_paise, amount_paise, sort_order)
    values (v_id, trim(v_item ->> 'description'), (v_item ->> 'quantity')::int, (v_item ->> 'unit_price_paise')::bigint,
            (v_item ->> 'quantity')::bigint * (v_item ->> 'unit_price_paise')::bigint, v_i);
    v_i := v_i + 1;
  end loop;

  update public.enquiries set status = 'quoted' where id = e.id;
  return v_id;
end;
$$;

create or replace function public.withdraw_quotation(p_quotation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquiry uuid;
begin
  select enquiry_id into v_enquiry from public.quotations where id = p_quotation_id and status = 'sent';
  if v_enquiry is null or not private.can_manage_enquiry(v_enquiry) then
    raise exception 'Quotation not found' using errcode = 'P0002';
  end if;
  update public.quotations set status = 'withdrawn' where id = p_quotation_id;
  update public.enquiries set status = 'open' where id = v_enquiry and status = 'quoted';
end;
$$;

/** Customer accepts or declines a sent quotation. Accepting holds the date 48 more hours. */
create or replace function public.respond_quotation(p_quotation_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quotations%rowtype;
  e public.enquiries%rowtype;
begin
  select * into q from public.quotations where id = p_quotation_id for update;
  if not found then
    raise exception 'Quotation not found' using errcode = 'P0002';
  end if;
  select * into e from public.enquiries where id = q.enquiry_id for update;
  if e.customer_id is distinct from auth.uid() then
    raise exception 'Quotation not found' using errcode = 'P0002';
  end if;
  if q.status <> 'sent' or e.status <> 'quoted' then
    raise exception 'This quotation is no longer open' using errcode = '22023';
  end if;
  if q.valid_until < now() or (e.reservation_id is not null and e.hold_expires_at < now()) then
    update public.quotations set status = 'expired' where id = q.id;
    raise exception 'This quotation has expired' using errcode = '22023';
  end if;

  if p_accept then
    update public.quotations set status = 'accepted', responded_at = now() where id = q.id;
    update public.enquiries set status = 'accepted' where id = e.id;
    perform private.extend_enquiry_hold(e.id);
  else
    update public.quotations set status = 'declined', responded_at = now() where id = q.id;
    update public.enquiries set status = 'open' where id = e.id;
  end if;
end;
$$;

/** Customer name for the vendor; phone and email only after the customer commits. */
create or replace function public.enquiry_contact(p_enquiry_id uuid)
returns table (name text, phone text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.display_name, p.full_name, 'Customer'),
         case when e.status in ('accepted', 'reserved') then p.phone end,
         case when e.status in ('accepted', 'reserved') then p.email::text end
  from public.enquiries e join public.profiles p on p.id = e.customer_id
  where e.id = p_enquiry_id and private.can_manage_enquiry(p_enquiry_id);
$$;

/**
 * Public per-day availability of a listing: available | unavailable | unknown
 * (no linked resources), plus whether the day is an auspicious date and the
 * listing's surcharge for it (B).
 */
create or replace function public.listing_availability(p_service_id uuid, p_from date, p_to date)
returns table (day date, status text, auspicious boolean, surcharge_bps int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz        text;
  v_city      uuid;
  v_surcharge int;
begin
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'Ask for at most 63 days' using errcode = '22023';
  end if;
  select c.timezone, s.city_id, s.auspicious_surcharge_bps into v_tz, v_city, v_surcharge
  from public.services s join public.organizations o on o.id = s.organization_id join public.cities c on c.id = s.city_id
  where s.id = p_service_id and s.status = 'published' and o.status = 'active';
  if v_tz is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  return query
  select d::date,
         case
           when not exists (select 1 from public.bookable_resources r where r.service_id = p_service_id and r.active) then 'unknown'
           when exists (
             select 1 from public.bookable_resources r
             where r.service_id = p_service_id and r.active
               and private.resource_free(r.id, tstzrange(d::date::timestamp at time zone v_tz, (d::date + 1)::timestamp at time zone v_tz, '[)'), 1)
           ) then 'available'
           else 'unavailable'
         end,
         a.is_auspicious,
         case when a.is_auspicious then v_surcharge else 0 end
  from generate_series(p_from, p_to, interval '1 day') d
  cross join lateral (
    select exists (
      select 1 from public.auspicious_dates ad
      where ad.is_published and ad.date = d::date and (ad.city_id is null or ad.city_id = v_city)
    ) as is_auspicious
  ) a;
end;
$$;

-- ---------- calendar safety + expiry job ---------------------------------------------
-- A hold that belongs to an enquiry is released by declining the enquiry, so the
-- customer sees what happened.
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

  update public.resource_reservations
     set status = case when p_cancel then 'cancelled'::public.reservation_status else 'released'::public.reservation_status end,
         notes  = coalesce(nullif(trim(p_reason), ''), notes)
   where id = p_reservation_id
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.release_expired_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.resource_reservations
     set status = 'released'
   where status = 'hold' and hold_expires_at < now();
  get diagnostics v_count = row_count;

  -- Enquiries whose 48-hour hold lapsed.
  update public.enquiries
     set status = 'expired'
   where status in ('open', 'quoted', 'accepted', 'reserved')
     and reservation_id is not null
     and hold_expires_at < now();
  update public.quotations q
     set status = 'expired'
   where q.status = 'sent' and q.valid_until < now();

  return v_count;
end;
$$;

-- ---------- grants -----------------------------------------------------------------------
revoke all on function public.create_enquiry(uuid, date, time, time, int, text, text) from public, anon;
revoke all on function public.cancel_enquiry(uuid) from public, anon;
revoke all on function public.decline_enquiry(uuid, text) from public, anon;
revoke all on function public.post_enquiry_message(uuid, text) from public, anon;
revoke all on function public.send_quotation(uuid, jsonb, bigint, int, int, text, text) from public, anon;
revoke all on function public.withdraw_quotation(uuid) from public, anon;
revoke all on function public.respond_quotation(uuid, boolean) from public, anon;
revoke all on function public.enquiry_contact(uuid) from public, anon;
revoke all on function public.listing_availability(uuid, date, date) from public;

grant execute on function public.create_enquiry(uuid, date, time, time, int, text, text) to authenticated;
grant execute on function public.cancel_enquiry(uuid) to authenticated;
grant execute on function public.decline_enquiry(uuid, text) to authenticated;
grant execute on function public.post_enquiry_message(uuid, text) to authenticated;
grant execute on function public.send_quotation(uuid, jsonb, bigint, int, int, text, text) to authenticated;
grant execute on function public.withdraw_quotation(uuid) to authenticated;
grant execute on function public.respond_quotation(uuid, boolean) to authenticated;
grant execute on function public.enquiry_contact(uuid) to authenticated;
grant execute on function public.listing_availability(uuid, date, date) to anon, authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on function private.caller_email() to authenticated;
grant execute on function private.can_view_resource(uuid) to authenticated, service_role;
grant execute on function private.can_manage_resource(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_manage_service(uuid) to authenticated, service_role;
grant execute on function private.try_uuid(text) to authenticated, service_role;
grant execute on function private.can_view_enquiry(uuid) to authenticated, service_role;
