-- =============================================================================
-- 1500 · Phase 5: bookings & payments (Razorpay test mode)
-- Decisions (product owner, 12 Nov 2026):
--   * advance % is set per listing by the vendor (default 25%, 10–100%) and
--     snapshotted onto the booking
--   * the balance can be paid online, or recorded by the vendor as received
--     offline (cash / UPI / bank transfer / cheque); both audited
--   * the advance must be paid within the 48-hour hold, else the date is released
--   * each listing picks a cancellation policy (flexible / moderate / strict);
--     refunds are computed here and issued manually by finance (online) or the
--     vendor (money they received offline). No escrow / split settlement (D8).
-- Money: integer paise (D6). Online payments are only ever marked paid by the
-- service role (signature-verified checkout callback or webhook).
-- =============================================================================

-- ---------- enums ------------------------------------------------------------------
create type public.cancellation_policy as enum ('flexible', 'moderate', 'strict');
create type public.booking_item_status as enum ('pending_payment', 'confirmed', 'cancelled', 'expired');
create type public.payment_method      as enum ('razorpay', 'offline');
create type public.payment_status      as enum ('created', 'paid', 'failed');
create type public.offline_payment_mode as enum ('cash', 'upi', 'bank_transfer', 'cheque');
create type public.refund_status       as enum ('pending', 'processing', 'processed', 'failed');

-- New enquiry state: the enquiry became a booking. (Only used inside plpgsql
-- bodies in this migration: a new enum value can't be used until committed.)
alter type public.enquiry_status add value if not exists 'booked';

-- ---------- listing terms ----------------------------------------------------------
alter table public.services
  add column advance_bps int not null default 2500 check (advance_bps between 1000 and 10000),
  add column cancellation_policy public.cancellation_policy not null default 'moderate';
grant update (advance_bps, cancellation_policy) on public.services to authenticated;

/**
 * Share of the paid amount refunded when a booking is cancelled.
 * Vendor cancellations always refund in full. Mirrored in
 * src/features/bookings/lib/money.ts (refundBps) for the preview.
 *   flexible: ≥ 7 days before → 100%, ≥ 1 day → 50%, else 0
 *   moderate: ≥ 30 days → 100%, ≥ 7 days → 50%, else 0
 *   strict:   ≥ 30 days → 50%, else 0
 */
create or replace function private.refund_bps(p_policy public.cancellation_policy, p_days_before int, p_by_vendor boolean)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when p_by_vendor then 10000
    when p_policy = 'flexible' then case when p_days_before >= 7 then 10000 when p_days_before >= 1 then 5000 else 0 end
    when p_policy = 'moderate' then case when p_days_before >= 30 then 10000 when p_days_before >= 7 then 5000 else 0 end
    else case when p_days_before >= 30 then 5000 else 0 end
  end;
$$;

-- ---------- tables -----------------------------------------------------------------
-- A booking is the customer's container (Phase 6 links it to an event). Each
-- vendor's part is an independent booking item.
create table public.bookings (
  id          uuid primary key default extensions.gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  event_id    uuid,                                   -- FK added in Phase 6 (events)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index bookings_customer_idx on public.bookings (customer_id, created_at desc);

create table public.booking_items (
  id                  uuid primary key default extensions.gen_random_uuid(),
  booking_id          uuid not null references public.bookings (id) on delete cascade,
  enquiry_id          uuid not null unique references public.enquiries (id) on delete restrict,
  quotation_id        uuid references public.quotations (id) on delete restrict,
  customer_id         uuid not null references public.profiles (id) on delete cascade,
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  branch_id           uuid,
  service_id          uuid not null references public.services (id) on delete restrict,
  reservation_id      uuid references public.resource_reservations (id) on delete set null,
  event_date          date not null,
  period              tstzrange not null,
  guests              int,
  status              public.booking_item_status not null default 'pending_payment',
  currency            char(3) not null default 'INR',
  total_paise         bigint not null check (total_paise > 0),
  advance_bps         int not null check (advance_bps between 1000 and 10000),
  advance_paise       bigint not null check (advance_paise > 0),
  paid_paise          bigint not null default 0 check (paid_paise >= 0),
  refund_due_paise    bigint not null default 0 check (refund_due_paise >= 0),
  cancellation_policy public.cancellation_policy not null,
  snapshot            jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  payment_due_at      timestamptz not null,
  confirmed_at        timestamptz,
  cancelled_at        timestamptz,
  cancelled_by_side   text check (cancelled_by_side in ('customer', 'vendor', 'system')),
  cancel_reason       text check (char_length(cancel_reason) <= 1000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (advance_paise <= total_paise),
  check (paid_paise <= total_paise)
);
create index booking_items_customer_idx on public.booking_items (customer_id, created_at desc);
create index booking_items_org_idx on public.booking_items (organization_id, status, event_date);
create index booking_items_due_idx on public.booking_items (payment_due_at) where status = 'pending_payment';

alter table public.resource_reservations
  add constraint resource_reservations_booking_item_fk
  foreign key (booking_item_id) references public.booking_items (id) on delete set null;

create table public.payments (
  id                  uuid primary key default extensions.gen_random_uuid(),
  booking_item_id     uuid not null references public.booking_items (id) on delete restrict,
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  customer_id         uuid not null references public.profiles (id) on delete cascade,
  kind                text not null check (kind in ('advance', 'balance')),
  method              public.payment_method not null,
  status              public.payment_status not null default 'created',
  amount_paise        bigint not null check (amount_paise > 0),
  currency            char(3) not null default 'INR',
  razorpay_order_id   text unique,
  razorpay_payment_id text unique,
  offline_mode        public.offline_payment_mode,
  reference           text check (char_length(reference) <= 200),
  note                text check (char_length(note) <= 500),
  recorded_by         uuid references public.profiles (id) on delete set null,
  idempotency_key     text check (char_length(idempotency_key) between 8 and 100),
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (booking_item_id, idempotency_key),
  check ((method = 'offline') = (offline_mode is not null))
);
create index payments_item_idx on public.payments (booking_item_id, created_at);

create table public.refunds (
  id                 uuid primary key default extensions.gen_random_uuid(),
  booking_item_id    uuid not null references public.booking_items (id) on delete restrict,
  payment_id         uuid not null references public.payments (id) on delete restrict,
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  customer_id        uuid not null references public.profiles (id) on delete cascade,
  method             public.payment_method not null,
  amount_paise       bigint not null check (amount_paise > 0),
  currency           char(3) not null default 'INR',
  status             public.refund_status not null default 'pending',
  razorpay_refund_id text unique,
  reference          text check (char_length(reference) <= 200),
  reason             text check (char_length(reason) <= 1000),
  processed_by       uuid references public.profiles (id) on delete set null,
  processed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index refunds_status_idx on public.refunds (status, created_at);
create index refunds_item_idx on public.refunds (booking_item_id);

-- Razorpay webhook deliveries, de-duplicated by event id (x-razorpay-event-id).
create table public.payment_webhook_events (
  event_id     text primary key check (char_length(event_id) between 1 and 200),
  event_type   text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

create trigger bookings_set_updated_at      before update on public.bookings      for each row execute function public.set_updated_at();
create trigger booking_items_set_updated_at before update on public.booking_items for each row execute function public.set_updated_at();
create trigger payments_set_updated_at      before update on public.payments      for each row execute function public.set_updated_at();
create trigger refunds_set_updated_at       before update on public.refunds       for each row execute function public.set_updated_at();
create trigger audit_booking_items after insert or update or delete on public.booking_items for each row execute function private.audit_row_change();
create trigger audit_payments      after insert or update or delete on public.payments      for each row execute function private.audit_row_change();
create trigger audit_refunds       after insert or update or delete on public.refunds       for each row execute function private.audit_row_change();

-- ---------- RLS: reads only; every write goes through the functions below -----------
create or replace function private.can_manage_booking_item(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.booking_items b
    where b.id = p_item_id and private.can_manage_resource(b.organization_id, b.branch_id));
$$;

alter table public.bookings               enable row level security;
alter table public.booking_items          enable row level security;
alter table public.payments               enable row level security;
alter table public.refunds                enable row level security;
alter table public.payment_webhook_events enable row level security;
revoke all on public.bookings, public.booking_items, public.payments, public.refunds, public.payment_webhook_events
  from anon, authenticated;
grant select on public.bookings, public.booking_items, public.payments, public.refunds to authenticated;

create policy bookings_select on public.bookings for select to authenticated
  using (customer_id = (select auth.uid()) or public.has_platform_permission('finance.read'));
create policy booking_items_select on public.booking_items for select to authenticated
  using (customer_id = (select auth.uid())
         or private.can_manage_resource(organization_id, branch_id)
         or public.has_platform_permission('finance.read'));
create policy payments_select on public.payments for select to authenticated
  using (customer_id = (select auth.uid())
         or private.can_manage_booking_item(booking_item_id)
         or public.has_platform_permission('finance.read'));
create policy refunds_select on public.refunds for select to authenticated
  using (customer_id = (select auth.uid())
         or private.can_manage_booking_item(booking_item_id)
         or public.has_platform_permission('finance.read'));
-- payment_webhook_events: service role only; explicit deny for everyone else.
create policy payment_webhook_events_none on public.payment_webhook_events for select to authenticated using (false);

-- ---------- booking terms ---------------------------------------------------------------
-- Total for an enquiry: the accepted quotation's total, or (instant booking) the
-- listed price with the auspicious surcharge, times guests/hours where the unit
-- needs it. Raises when the enquiry can't be booked online.
create or replace function private.enquiry_booking_terms(p_enquiry_id uuid)
returns table (total_paise bigint, quotation_id uuid, advance_bps int, policy public.cancellation_policy, due_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e       public.enquiries%rowtype;
  s       public.services%rowtype;
  q       public.quotations%rowtype;
  v_base  bigint;
  v_bps   int;
  v_mult  numeric := 1;
  v_total bigint;
begin
  select * into e from public.enquiries where id = p_enquiry_id;
  select * into s from public.services where id = e.service_id;

  if e.status::text = 'accepted' then
    select * into q from public.quotations where enquiry_id = e.id and status = 'accepted' order by version desc limit 1;
    if not found then
      raise exception 'No accepted quotation' using errcode = '22023';
    end if;
    v_total := q.total_paise;
  elsif e.status::text = 'reserved' then
    v_base := (e.price_snapshot ->> 'base_price_paise')::bigint;
    if v_base is null or (e.price_snapshot ->> 'price_type') = 'on_request' then
      raise exception 'This listing has no online price; ask the vendor for a quote' using errcode = '22023';
    end if;
    v_bps := coalesce((e.price_snapshot ->> 'surcharge_bps')::int, 0);
    if v_bps > 0 then
      v_base := round(v_base * (10000 + v_bps) / 10000.0 / 100) * 100;   -- same rounding as applySurcharge()
    end if;
    case e.price_snapshot ->> 'price_unit'
      when 'per_plate', 'per_person' then
        if e.guests is null then
          raise exception 'Add the guest count to book this listing' using errcode = '22023';
        end if;
        v_mult := e.guests;
      when 'per_hour' then
        v_mult := ceil(extract(epoch from upper(e.period) - lower(e.period)) / 3600.0);
      else
        v_mult := 1;
    end case;
    v_total := (v_base * v_mult)::bigint;
  else
    raise exception 'Only accepted quotes or instant reservations can be booked' using errcode = '22023';
  end if;

  if v_total is null or v_total <= 0 then
    raise exception 'The booking amount must be more than zero' using errcode = '22023';
  end if;

  return query select v_total, q.id, s.advance_bps, s.cancellation_policy,
                      coalesce(e.hold_expires_at, now() + make_interval(mins => private.enquiry_hold_minutes()));
end;
$$;

/** What booking would cost (customer, before confirming). */
create or replace function public.booking_preview(p_enquiry_id uuid)
returns table (total_paise bigint, advance_bps int, advance_paise bigint, cancellation_policy public.cancellation_policy,
               pay_by timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
begin
  if not exists (select 1 from public.enquiries e where e.id = p_enquiry_id and e.customer_id = auth.uid()) then
    raise exception 'Enquiry not found' using errcode = 'P0002';
  end if;
  select * into t from private.enquiry_booking_terms(p_enquiry_id);
  return query select t.total_paise, t.advance_bps, ceil(t.total_paise * t.advance_bps / 10000.0)::bigint,
                      t.policy, t.due_at;
end;
$$;

/**
 * Customer turns an accepted quote / instant reservation into a booking.
 * Snapshots price, quote lines and cancellation policy. The advance must be
 * paid before the hold expires (payment_due_at). Idempotent per enquiry.
 */
create or replace function public.create_booking(p_enquiry_id uuid, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  e         public.enquiries%rowtype;
  t         record;
  v_booking uuid;
  v_item    uuid;
  v_quote   jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;

  select * into e from public.enquiries where id = p_enquiry_id for update;
  if not found or e.customer_id <> v_uid then
    raise exception 'Enquiry not found' using errcode = 'P0002';
  end if;
  -- Already booked (double click / retry): return the same booking item.
  select id into v_item from public.booking_items where enquiry_id = e.id;
  if found then
    return v_item;
  end if;
  if e.reservation_id is not null and e.hold_expires_at < now() then
    raise exception 'The hold on this date has expired' using errcode = '22023';
  end if;

  select * into t from private.enquiry_booking_terms(e.id);

  if t.quotation_id is not null then
    select jsonb_build_object(
             'version', q.version, 'subtotal_paise', q.subtotal_paise, 'discount_paise', q.discount_paise,
             'tax_bps', q.tax_bps, 'tax_paise', q.tax_paise, 'total_paise', q.total_paise,
             'notes', q.notes, 'terms', q.terms,
             'items', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity,
                                                                    'unit_price_paise', i.unit_price_paise,
                                                                    'amount_paise', i.amount_paise) order by i.sort_order)
                                from public.quotation_items i where i.quotation_id = q.id), '[]'::jsonb))
      into v_quote
    from public.quotations q where q.id = t.quotation_id;
  end if;

  insert into public.bookings (customer_id) values (v_uid) returning id into v_booking;
  insert into public.booking_items (
    booking_id, enquiry_id, quotation_id, customer_id, organization_id, branch_id, service_id, reservation_id,
    event_date, period, guests, currency, total_paise, advance_bps, advance_paise, cancellation_policy, snapshot,
    payment_due_at
  ) values (
    v_booking, e.id, t.quotation_id, v_uid, e.organization_id, e.branch_id, e.service_id, e.reservation_id,
    e.event_date, e.period, e.guests, coalesce(e.price_snapshot ->> 'currency', 'INR'), t.total_paise, t.advance_bps,
    ceil(t.total_paise * t.advance_bps / 10000.0)::bigint, t.policy,
    jsonb_build_object('listing', e.price_snapshot, 'quotation', v_quote, 'booking_mode', e.booking_mode,
                       'policy', t.policy, 'advance_bps', t.advance_bps, 'idempotency_key', p_idempotency_key),
    t.due_at
  )
  returning id into v_item;

  update public.resource_reservations set booking_item_id = v_item where id = e.reservation_id;
  update public.enquiries set status = 'booked' where id = e.id;
  return v_item;
end;
$$;

-- ---------- payment state machine (internal) --------------------------------------------
-- Applies a paid payment to its booking item: adds to paid_paise and confirms
-- the item (and its reservation) once the advance is covered. A payment that
-- arrives after the item was cancelled or expired is queued for refund.
create or replace function private.apply_paid_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p   public.payments%rowtype;
  b   public.booking_items%rowtype;
  v_res_status public.reservation_status;
begin
  select * into p from public.payments where id = p_payment_id;
  select * into b from public.booking_items where id = p.booking_item_id for update;

  if b.status in ('cancelled', 'expired') then
    insert into public.refunds (booking_item_id, payment_id, organization_id, customer_id, method, amount_paise, currency, reason)
    values (b.id, p.id, b.organization_id, b.customer_id, p.method, p.amount_paise, p.currency,
            'Payment received after the booking was ' || b.status::text);
    update public.booking_items
       set refund_due_paise = refund_due_paise + p.amount_paise, paid_paise = least(paid_paise + p.amount_paise, total_paise)
     where id = b.id;
    return;
  end if;

  update public.booking_items set paid_paise = paid_paise + p.amount_paise where id = b.id
  returning * into b;

  if b.status = 'pending_payment' and b.paid_paise >= b.advance_paise then
    if b.reservation_id is not null then
      -- A hold that is still 'hold' (even if just past its expiry) was never
      -- taken by anyone else: the exclusion constraint covers holds.
      select status into v_res_status from public.resource_reservations where id = b.reservation_id for update;
      if v_res_status <> 'hold' then
        update public.booking_items
           set status = 'cancelled', cancelled_at = now(), cancelled_by_side = 'system',
               cancel_reason = 'The date was released before the advance arrived',
               refund_due_paise = refund_due_paise + b.paid_paise
         where id = b.id;
        insert into public.refunds (booking_item_id, payment_id, organization_id, customer_id, method, amount_paise, currency, reason)
        select b.id, pp.id, b.organization_id, b.customer_id, pp.method, pp.amount_paise, pp.currency,
               'The date was released before the advance arrived'
        from public.payments pp where pp.booking_item_id = b.id and pp.status = 'paid';
        return;
      end if;
      update public.resource_reservations
         set status = 'confirmed', hold_expires_at = null
       where id = b.reservation_id;
    end if;
    update public.booking_items set status = 'confirmed', confirmed_at = now() where id = b.id;
  end if;
end;
$$;

/**
 * Customer starts an online payment: the advance while pending, else the
 * balance. Returns the payment to create a Razorpay order for. Reuses an
 * unpaid payment for the same amount so retries don't pile up.
 */
create or replace function public.start_payment(p_booking_item_id uuid)
returns table (payment_id uuid, amount_paise bigint, currency char(3), razorpay_order_id text, kind text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  b        public.booking_items%rowtype;
  v_amount bigint;
  v_kind   text;
  p        public.payments%rowtype;
begin
  select * into b from public.booking_items where id = p_booking_item_id for update;
  if not found or b.customer_id is distinct from auth.uid() then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if b.status = 'pending_payment' then
    if b.payment_due_at < now() then
      raise exception 'The time to pay the advance has passed' using errcode = '22023';
    end if;
    v_kind := 'advance';
    v_amount := b.advance_paise - b.paid_paise;
  elsif b.status = 'confirmed' then
    v_kind := 'balance';
    v_amount := b.total_paise - b.paid_paise;
  else
    raise exception 'This booking cannot be paid' using errcode = '22023';
  end if;
  if v_amount <= 0 then
    raise exception 'Nothing is due' using errcode = '22023';
  end if;

  select * into p from public.payments pp
  where pp.booking_item_id = b.id and pp.method = 'razorpay' and pp.status = 'created'
    and pp.amount_paise = v_amount and pp.kind = v_kind and pp.created_at > now() - interval '1 day'
  order by pp.created_at desc limit 1;
  if not found then
    insert into public.payments (booking_item_id, organization_id, customer_id, kind, method, amount_paise, currency)
    values (b.id, b.organization_id, b.customer_id, v_kind, 'razorpay', v_amount, b.currency)
    returning * into p;
  end if;
  return query select p.id, p.amount_paise, p.currency, p.razorpay_order_id, p.kind;
end;
$$;

/** Service role only: store the Razorpay order created for a payment. */
create or replace function public.attach_payment_order(p_payment_id uuid, p_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_system_caller() then
    raise exception 'Service role only' using errcode = '42501';
  end if;
  update public.payments set razorpay_order_id = p_order_id
   where id = p_payment_id and status = 'created' and razorpay_order_id is null;
  if not found then
    raise exception 'Payment not found or already has an order' using errcode = 'P0002';
  end if;
end;
$$;

/**
 * Service role only: a Razorpay payment was captured (verified checkout
 * callback or webhook). Idempotent: repeated calls for the same order are
 * no-ops. The amount must match what we asked for. Returns the booking item.
 */
create or replace function public.confirm_online_payment(p_order_id text, p_payment_id text, p_amount_paise bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payments%rowtype;
begin
  if not private.is_system_caller() then
    raise exception 'Service role only' using errcode = '42501';
  end if;
  select * into p from public.payments where razorpay_order_id = p_order_id for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if p.status = 'paid' then
    return p.booking_item_id;
  end if;
  if p_amount_paise is distinct from p.amount_paise then
    raise exception 'Amount mismatch for order %', p_order_id using errcode = '22023';
  end if;
  update public.payments
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now()
   where id = p.id;
  perform private.apply_paid_payment(p.id);
  return p.booking_item_id;
end;
$$;

/** Service role only: Razorpay reported a failed attempt (the customer may retry). */
create or replace function public.mark_online_payment_failed(p_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_system_caller() then
    raise exception 'Service role only' using errcode = '42501';
  end if;
  update public.payments set status = 'failed' where razorpay_order_id = p_order_id and status = 'created';
end;
$$;

/** Vendor records money received outside the platform (cash, UPI, bank transfer, cheque). */
create or replace function public.record_offline_payment(
  p_booking_item_id uuid,
  p_amount_paise    bigint,
  p_mode            public.offline_payment_mode,
  p_reference       text,
  p_note            text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b    public.booking_items%rowtype;
  v_id uuid;
begin
  if not private.can_manage_booking_item(p_booking_item_id) then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;
  select id into v_id from public.payments where booking_item_id = p_booking_item_id and idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;

  select * into b from public.booking_items where id = p_booking_item_id for update;
  if b.status not in ('pending_payment', 'confirmed') then
    raise exception 'Payments can only be recorded for open bookings' using errcode = '22023';
  end if;
  if p_mode is null or coalesce(p_amount_paise, 0) <= 0 or p_amount_paise > b.total_paise - b.paid_paise then
    raise exception 'The amount must be between ₹0.01 and the balance due' using errcode = '22023';
  end if;
  if b.status = 'pending_payment' and b.reservation_id is not null
     and (select status from public.resource_reservations where id = b.reservation_id) <> 'hold' then
    raise exception 'The date was already released' using errcode = '22023';
  end if;

  insert into public.payments (booking_item_id, organization_id, customer_id, kind, method, status, amount_paise, currency,
                               offline_mode, reference, note, recorded_by, idempotency_key, paid_at)
  values (b.id, b.organization_id, b.customer_id,
          case when b.status = 'pending_payment' then 'advance' else 'balance' end,
          'offline', 'paid', p_amount_paise, b.currency, p_mode, nullif(trim(p_reference), ''), nullif(trim(p_note), ''),
          auth.uid(), p_idempotency_key, now())
  returning id into v_id;
  perform private.apply_paid_payment(v_id);
  return v_id;
end;
$$;

-- ---------- cancellation & refunds ---------------------------------------------------------
-- Splits a refund amount across the item's paid payments (online first, newest
-- first) so each refund row can be issued against one payment.
create or replace function private.queue_refunds(p_item_id uuid, p_amount bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b      public.booking_items%rowtype;
  p      record;
  v_left bigint := p_amount;
  v_take bigint;
begin
  if coalesce(p_amount, 0) <= 0 then
    return;
  end if;
  select * into b from public.booking_items where id = p_item_id;
  for p in
    select pp.id, pp.method, pp.currency,
           pp.amount_paise - coalesce((select sum(r.amount_paise) from public.refunds r
                                       where r.payment_id = pp.id and r.status <> 'failed'), 0) as refundable
    from public.payments pp
    where pp.booking_item_id = p_item_id and pp.status = 'paid'
    order by (pp.method = 'razorpay') desc, pp.paid_at desc
  loop
    exit when v_left <= 0;
    v_take := least(v_left, p.refundable);
    if v_take > 0 then
      insert into public.refunds (booking_item_id, payment_id, organization_id, customer_id, method, amount_paise, currency, reason)
      values (b.id, p.id, b.organization_id, b.customer_id, p.method, v_take, p.currency, p_reason);
      v_left := v_left - v_take;
    end if;
  end loop;
  update public.booking_items set refund_due_paise = refund_due_paise + (p_amount - v_left) where id = p_item_id;
end;
$$;

/** Refund the caller would get by cancelling now (customer side: policy; vendor side: full). */
create or replace function public.cancellation_quote(p_booking_item_id uuid)
returns table (refund_paise bigint, refund_bps int, days_before int, by_vendor boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b         public.booking_items%rowtype;
  v_vendor  boolean;
  v_days    int;
  v_bps     int;
  v_tz      text;
begin
  select * into b from public.booking_items where id = p_booking_item_id;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if b.customer_id = auth.uid() then
    v_vendor := false;
  elsif private.can_manage_booking_item(b.id) then
    v_vendor := true;
  else
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  select c.timezone into v_tz from public.services s join public.cities c on c.id = s.city_id where s.id = b.service_id;
  v_days := b.event_date - (now() at time zone coalesce(v_tz, 'Asia/Kolkata'))::date;
  v_bps := private.refund_bps(b.cancellation_policy, v_days, v_vendor);
  return query select floor(b.paid_paise * v_bps / 10000.0)::bigint, v_bps, v_days, v_vendor;
end;
$$;

/**
 * Customer or vendor cancels one booking item (never cascades to others).
 * Releases the date and queues refunds per the snapshotted policy
 * (vendor cancellations refund everything paid).
 */
create or replace function public.cancel_booking_item(p_booking_item_id uuid, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  b   public.booking_items%rowtype;
  q   record;
begin
  select * into q from public.cancellation_quote(p_booking_item_id);   -- authorises the caller
  select * into b from public.booking_items where id = p_booking_item_id for update;
  if b.status not in ('pending_payment', 'confirmed') then
    raise exception 'This booking is already closed' using errcode = '22023';
  end if;
  if now() >= lower(b.period) then
    raise exception 'Bookings cannot be cancelled after they start' using errcode = '22023';
  end if;
  if q.by_vendor and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give the customer a reason' using errcode = '22023';
  end if;

  update public.booking_items
     set status = 'cancelled', cancelled_at = now(),
         cancelled_by_side = case when q.by_vendor then 'vendor' else 'customer' end,
         cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = b.id;
  update public.resource_reservations set status = 'cancelled'
   where id = b.reservation_id and status in ('hold', 'confirmed');
  perform private.queue_refunds(b.id, q.refund_paise,
    case when q.by_vendor then 'Cancelled by the vendor' else 'Cancelled by the customer' end);
  return q.refund_paise;
end;
$$;

/**
 * Starts issuing a refund. Online refunds: finance only (the app then calls
 * Razorpay and reports back with complete_refund). Offline refunds: finance or
 * the vendor who received the money. Returns what to refund against.
 */
create or replace function public.begin_refund(p_refund_id uuid)
returns table (refund_id uuid, method public.payment_method, amount_paise bigint, razorpay_payment_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refunds%rowtype;
begin
  select * into r from public.refunds where id = p_refund_id for update;
  if not found
     or not (public.has_platform_permission('finance.manage')
             or (r.method = 'offline' and private.can_manage_booking_item(r.booking_item_id))) then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;
  if r.status not in ('pending', 'failed') then
    raise exception 'This refund is already %', r.status using errcode = '22023';
  end if;
  update public.refunds set status = 'processing' where id = r.id;
  return query select r.id, r.method, r.amount_paise, (select p.razorpay_payment_id from public.payments p where p.id = r.payment_id);
end;
$$;

create or replace function public.complete_refund(p_refund_id uuid, p_success boolean, p_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refunds%rowtype;
begin
  select * into r from public.refunds where id = p_refund_id for update;
  if not found
     or not (private.is_system_caller()
             or public.has_platform_permission('finance.manage')
             or (r.method = 'offline' and private.can_manage_booking_item(r.booking_item_id))) then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;
  if r.status = 'processed' then
    return;
  end if;
  if r.status <> 'processing' then
    raise exception 'Start the refund first' using errcode = '22023';
  end if;
  if p_success and r.method = 'offline' and nullif(trim(coalesce(p_reference, '')), '') is null then
    raise exception 'Add a reference (e.g. UPI transaction id)' using errcode = '22023';
  end if;
  update public.refunds
     set status = case when p_success then 'processed'::public.refund_status else 'failed'::public.refund_status end,
         reference = coalesce(nullif(trim(p_reference), ''), reference),
         razorpay_refund_id = case when r.method = 'razorpay' and p_success then coalesce(nullif(trim(p_reference), ''), razorpay_refund_id) else razorpay_refund_id end,
         processed_by = auth.uid(),
         processed_at = case when p_success then now() end
   where id = r.id;
end;
$$;

/** Service role only: Razorpay webhook refund.processed / refund.failed. */
create or replace function public.settle_online_refund(p_razorpay_refund_id text, p_success boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_system_caller() then
    raise exception 'Service role only' using errcode = '42501';
  end if;
  update public.refunds
     set status = case when p_success then 'processed'::public.refund_status else 'failed'::public.refund_status end,
         processed_at = case when p_success then coalesce(processed_at, now()) end
   where razorpay_refund_id = p_razorpay_refund_id and status <> 'processed';
end;
$$;

/** Customer name for the vendor; contact only once the customer committed (now incl. booked). */
create or replace function public.enquiry_contact(p_enquiry_id uuid)
returns table (name text, phone text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select coalesce(p.display_name, p.full_name, 'Customer'),
         case when e.status::text in ('accepted', 'reserved', 'booked') then p.phone end,
         case when e.status::text in ('accepted', 'reserved', 'booked') then p.email::text end
  from public.enquiries e join public.profiles p on p.id = e.customer_id
  where e.id = p_enquiry_id and private.can_manage_enquiry(p_enquiry_id);
end;
$$;

/** Messages stay open while the enquiry is live or booked. */
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

-- ---------- expiry job: unpaid bookings release the date ------------------------------
create or replace function public.release_expired_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Bookings whose advance wasn't paid in time (their hold expires at the same moment).
  update public.booking_items
     set status = 'expired', cancelled_at = now(), cancelled_by_side = 'system',
         cancel_reason = 'The advance was not paid in time'
   where status = 'pending_payment' and payment_due_at < now();

  update public.resource_reservations
     set status = 'released'
   where status = 'hold' and hold_expires_at < now();
  get diagnostics v_count = row_count;

  update public.enquiries
     set status = 'expired'
   where status in ('open', 'quoted', 'accepted', 'reserved')
     and reservation_id is not null
     and hold_expires_at < now();
  update public.enquiries e
     set status = 'expired'
    from public.booking_items b
   where b.enquiry_id = e.id and b.status = 'expired' and e.status::text = 'booked';
  update public.quotations q
     set status = 'expired'
   where q.status = 'sent' and q.valid_until < now();

  return v_count;
end;
$$;

-- ---------- grants ----------------------------------------------------------------------
revoke all on function public.booking_preview(uuid) from public, anon;
revoke all on function public.create_booking(uuid, text) from public, anon;
revoke all on function public.start_payment(uuid) from public, anon;
revoke all on function public.attach_payment_order(uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_online_payment(text, text, bigint) from public, anon, authenticated;
revoke all on function public.mark_online_payment_failed(text) from public, anon, authenticated;
revoke all on function public.settle_online_refund(text, boolean) from public, anon, authenticated;
revoke all on function public.record_offline_payment(uuid, bigint, public.offline_payment_mode, text, text, text) from public, anon;
revoke all on function public.cancellation_quote(uuid) from public, anon;
revoke all on function public.cancel_booking_item(uuid, text) from public, anon;
revoke all on function public.begin_refund(uuid) from public, anon;
revoke all on function public.complete_refund(uuid, boolean, text) from public, anon;
revoke all on function public.enquiry_contact(uuid) from public, anon;
revoke all on function public.post_enquiry_message(uuid, text) from public, anon;

grant execute on function public.booking_preview(uuid) to authenticated;
grant execute on function public.create_booking(uuid, text) to authenticated;
grant execute on function public.start_payment(uuid) to authenticated;
grant execute on function public.attach_payment_order(uuid, text) to service_role;
grant execute on function public.confirm_online_payment(text, text, bigint) to service_role;
grant execute on function public.mark_online_payment_failed(text) to service_role;
grant execute on function public.settle_online_refund(text, boolean) to service_role;
grant execute on function public.record_offline_payment(uuid, bigint, public.offline_payment_mode, text, text, text) to authenticated;
grant execute on function public.cancellation_quote(uuid) to authenticated;
grant execute on function public.cancel_booking_item(uuid, text) to authenticated;
grant execute on function public.begin_refund(uuid) to authenticated;
grant execute on function public.complete_refund(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.enquiry_contact(uuid) to authenticated;
grant execute on function public.post_enquiry_message(uuid, text) to authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on function private.can_manage_booking_item(uuid) to authenticated, service_role;
