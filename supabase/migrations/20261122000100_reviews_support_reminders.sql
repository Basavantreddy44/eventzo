-- Roadmap Phase B batch 3a
--   C7  verified reviews: only the customer of a confirmed booking whose event day
--       has passed can review it; photos; one vendor reply; admin can hide.
--   C10/S2 Help button + support desk: tickets tied to a booking, with status,
--       owner, a first-reply target (SLA), messages and internal notes. Status
--       changes are audited.
--   C8  payment timeline + reminders: a balance due date per booking item and a
--       daily job that reminds 7 days and 1 day before it; asks for a review the
--       day after the event. Payment notifications open the receipt.

-- ======================================================================================
-- C8: balance due date
-- ======================================================================================
-- The balance falls due 3 days before the event (or on the day of booking when the
-- event is closer than that). Kept on the item so a later rule change never moves
-- the date of an existing booking.
alter table public.booking_items add column balance_due_on date;
update public.booking_items
   set balance_due_on = greatest(event_date - 3, (created_at at time zone 'Asia/Kolkata')::date);
alter table public.booking_items alter column balance_due_on set not null;
alter table public.booking_items add column review_requested_at timestamptz;

create or replace function private.set_balance_due_on()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.balance_due_on := greatest(new.event_date - 3, (coalesce(new.created_at, now()) at time zone 'Asia/Kolkata')::date);
  return new;
end;
$$;
create trigger booking_items_balance_due before insert on public.booking_items
  for each row execute function private.set_balance_due_on();

create table public.payment_reminders (
  booking_item_id uuid not null references public.booking_items (id) on delete cascade,
  days_before     int not null check (days_before in (7, 1)),
  due_on          date not null,
  sent_at         timestamptz not null default now(),
  primary key (booking_item_id, days_before, due_on)
);
alter table public.payment_reminders enable row level security;
revoke all on public.payment_reminders from anon, authenticated;
grant select on public.payment_reminders to authenticated;
-- Written only by the daily job; the customer and the vendor can see what was sent.
create policy payment_reminders_select on public.payment_reminders for select to authenticated
  using (exists (select 1 from public.booking_items b
                 where b.id = booking_item_id and b.customer_id = (select auth.uid()))
         or private.can_manage_booking_item(booking_item_id)
         or public.has_platform_permission('finance.read'));

-- The receipt opens from the payment message (WhatsApp/email/in-app).
create or replace function private.notify_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b        public.booking_items%rowtype;
  v_params jsonb;
begin
  if new.status <> 'paid' or (tg_op = 'UPDATE' and old.status = 'paid') then
    return null;
  end if;
  select * into b from public.booking_items where id = new.booking_item_id;
  v_params := jsonb_build_object('listing', b.snapshot -> 'listing' ->> 'title', 'amount_paise', new.amount_paise,
                                 'kind', new.kind);
  perform private.notify(b.customer_id, 'payments', 'payment.received', v_params, '/receipts/' || new.id);
  perform private.notify_vendor(b.organization_id, b.branch_id, 'payments', 'payment.received', v_params,
                                '/vendor/bookings/' || b.id);
  return null;
end;
$$;

-- ======================================================================================
-- C7: reviews
-- ======================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Customers upload into their own folder: {user_id}/{uuid}.{ext}
create policy review_photos_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy review_photos_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table public.reviews (
  id                uuid primary key default extensions.gen_random_uuid(),
  booking_item_id   uuid not null unique references public.booking_items (id) on delete cascade,
  service_id        uuid not null references public.services (id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  customer_id       uuid not null references public.profiles (id) on delete cascade,
  rating            smallint not null check (rating between 1 and 5),
  body              text not null check (char_length(btrim(body)) between 10 and 2000),
  photos            text[] not null default '{}' check (cardinality(photos) <= 4),
  status            text not null default 'published' check (status in ('published', 'hidden')),
  hidden_reason     text check (char_length(hidden_reason) <= 500),
  vendor_reply      text check (char_length(btrim(vendor_reply)) between 1 and 1000),
  vendor_replied_at timestamptz,
  vendor_replied_by uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index reviews_service_idx on public.reviews (service_id, created_at desc) where status = 'published';
create index reviews_org_idx on public.reviews (organization_id, created_at desc);
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();
create trigger audit_reviews after insert or update or delete on public.reviews
  for each row execute function private.audit_row_change();

insert into public.permissions (code, description) values
  ('reviews.moderate', 'Hide or restore customer reviews');
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where p.code = 'reviews.moderate' and r.code in ('super_admin', 'support_agent');

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to authenticated;
create policy reviews_select on public.reviews for select to authenticated
  using (customer_id = (select auth.uid())
         or private.can_manage_booking_item(booking_item_id)
         or public.has_platform_permission('reviews.moderate'));

/** Reviewable = the caller's confirmed booking whose event day has passed (India time). */
create or replace function public.submit_review(
  p_booking_item_id uuid,
  p_rating          int,
  p_body            text,
  p_photos          text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b      public.booking_items%rowtype;
  r      public.reviews%rowtype;
  v_uid  uuid := auth.uid();
  v_path text;
  v_id   uuid;
begin
  select * into b from public.booking_items where id = p_booking_item_id;
  if not found or b.customer_id is distinct from v_uid then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if b.status <> 'confirmed' or b.event_date >= (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'You can review a booking after the event has taken place' using errcode = '22023';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Choose a rating from 1 to 5' using errcode = '22023';
  end if;
  foreach v_path in array coalesce(p_photos, '{}') loop
    if v_path !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
      raise exception 'Invalid photo' using errcode = '22023';
    end if;
  end loop;

  select * into r from public.reviews where booking_item_id = b.id for update;
  if found then
    if r.vendor_reply is not null then
      raise exception 'The vendor has replied; the review can no longer be changed' using errcode = '22023';
    end if;
    update public.reviews
       set rating = p_rating, body = btrim(p_body), photos = coalesce(p_photos, '{}')
     where id = r.id;
    return r.id;
  end if;

  insert into public.reviews (booking_item_id, service_id, organization_id, customer_id, rating, body, photos)
  values (b.id, b.service_id, b.organization_id, v_uid, p_rating, btrim(p_body), coalesce(p_photos, '{}'))
  returning id into v_id;

  perform private.notify_vendor(b.organization_id, b.branch_id, 'bookings', 'review.new',
                                jsonb_build_object('listing', b.snapshot -> 'listing' ->> 'title', 'rating', p_rating),
                                '/vendor/bookings/' || b.id);
  return v_id;
end;
$$;

create or replace function public.reply_review(p_review_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reviews%rowtype;
begin
  select * into r from public.reviews where id = p_review_id for update;
  if not found or not private.can_manage_booking_item(r.booking_item_id) then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  update public.reviews
     set vendor_reply = nullif(btrim(p_reply), ''), vendor_replied_at = now(), vendor_replied_by = auth.uid()
   where id = r.id;
  if r.vendor_reply is null then
    perform private.notify(r.customer_id, 'bookings', 'review.replied',
                           jsonb_build_object('listing', (select title from public.services where id = r.service_id)),
                           '/account/bookings/' || r.booking_item_id);
  end if;
end;
$$;

create or replace function public.set_review_status(p_review_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_platform_permission('reviews.moderate') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_status not in ('published', 'hidden') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  if p_status = 'hidden' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give a reason for hiding the review' using errcode = '22023';
  end if;
  update public.reviews
     set status = p_status, hidden_reason = case when p_status = 'hidden' then btrim(p_reason) end
   where id = p_review_id;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Public: published reviews of a live listing. Reviewer shown as "Asha R.".
create or replace function public.listing_reviews(p_service_id uuid, p_limit int default 10, p_offset int default 0)
returns table (
  id                uuid,
  rating            smallint,
  body              text,
  photos            text[],
  reviewer          text,
  event_month       date,
  vendor_reply      text,
  vendor_replied_at timestamptz,
  created_at        timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.body, r.photos,
         coalesce(nullif(split_part(btrim(p.full_name), ' ', 1), ''), 'Customer')
           || coalesce(' ' || nullif(left(split_part(btrim(p.full_name), ' ', 2), 1), '') || '.', ''),
         date_trunc('month', b.event_date)::date,
         r.vendor_reply, r.vendor_replied_at, r.created_at
  from public.reviews r
  join public.services s on s.id = r.service_id
  join public.organizations o on o.id = s.organization_id
  join public.booking_items b on b.id = r.booking_item_id
  join public.profiles p on p.id = r.customer_id
  where r.service_id = p_service_id and r.status = 'published'
    and s.status = 'published' and o.status = 'active'
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.listing_rating(p_service_id uuid)
returns table (average numeric, total int, stars int[])
language sql
stable
security definer
set search_path = ''
as $$
  select round(avg(r.rating)::numeric, 1), count(*)::int,
         array[count(*) filter (where r.rating = 1), count(*) filter (where r.rating = 2),
               count(*) filter (where r.rating = 3), count(*) filter (where r.rating = 4),
               count(*) filter (where r.rating = 5)]::int[]
  from public.reviews r
  join public.services s on s.id = r.service_id
  join public.organizations o on o.id = s.organization_id
  where r.service_id = p_service_id and r.status = 'published'
    and s.status = 'published' and o.status = 'active';
$$;

grant execute on function public.listing_reviews(uuid, int, int), public.listing_rating(uuid) to anon, authenticated;

-- ======================================================================================
-- C10 / S2: support desk
-- ======================================================================================
create table public.support_tickets (
  id                uuid primary key default extensions.gen_random_uuid(),
  ref_no            bigint generated always as identity (start with 1001) unique,
  customer_id       uuid not null references public.profiles (id) on delete cascade,
  booking_item_id   uuid references public.booking_items (id) on delete set null,
  organization_id   uuid references public.organizations (id) on delete set null,
  topic             text not null check (topic in ('vendor_not_responding', 'change_date', 'cancel', 'problem', 'other')),
  status            text not null default 'open'
                    check (status in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  priority          text not null default 'normal' check (priority in ('normal', 'high')),
  assigned_to       uuid references public.profiles (id) on delete set null,
  sla_due_at        timestamptz not null,
  first_response_at timestamptz,
  resolved_at       timestamptz,
  idempotency_key   text check (char_length(idempotency_key) between 8 and 100),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (customer_id, idempotency_key)
);
create index support_tickets_queue_idx on public.support_tickets (status, sla_due_at);
create index support_tickets_customer_idx on public.support_tickets (customer_id, created_at desc);
create index support_tickets_item_idx on public.support_tickets (booking_item_id);
create trigger support_tickets_set_updated_at before update on public.support_tickets
  for each row execute function public.set_updated_at();
create trigger audit_support_tickets after insert or update or delete on public.support_tickets
  for each row execute function private.audit_row_change();

create table public.support_messages (
  id         uuid primary key default extensions.gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  side       text not null check (side in ('customer', 'agent')),
  internal   boolean not null default false check (not internal or side = 'agent'),
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

alter table public.support_tickets  enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_tickets, public.support_messages from anon, authenticated;
grant select on public.support_tickets, public.support_messages to authenticated;
create policy support_tickets_select on public.support_tickets for select to authenticated
  using (customer_id = (select auth.uid()) or public.has_platform_permission('support.manage'));
create policy support_messages_select on public.support_messages for select to authenticated
  using (public.has_platform_permission('support.manage')
         or (not internal and exists (select 1 from public.support_tickets t
                                      where t.id = ticket_id and t.customer_id = (select auth.uid()))));

-- First-reply targets: "problem" and "vendor not responding" within 4 hours, the rest within 24.
create or replace function private.support_sla_hours(p_topic text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when p_topic in ('problem', 'vendor_not_responding') then 4 else 24 end;
$$;

create or replace function public.open_support_ticket(
  p_booking_item_id uuid,
  p_topic           text,
  p_body            text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  b     public.booking_items%rowtype;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select id into v_id from public.support_tickets where customer_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;
  if p_booking_item_id is not null then
    select * into b from public.booking_items where id = p_booking_item_id;
    if not found or b.customer_id <> v_uid then
      raise exception 'Booking not found' using errcode = 'P0002';
    end if;
  end if;
  if p_topic not in ('vendor_not_responding', 'change_date', 'cancel', 'problem', 'other') then
    raise exception 'Choose what you need help with' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) < 10 then
    raise exception 'Tell us a little more (at least 10 characters)' using errcode = '22023';
  end if;
  if (select count(*) from public.support_tickets
      where customer_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many requests today. Please reply on an existing request' using errcode = '54000';
  end if;

  insert into public.support_tickets (customer_id, booking_item_id, organization_id, topic, priority, sla_due_at,
                                      idempotency_key)
  values (v_uid, b.id, b.organization_id, p_topic,
          case when p_topic = 'problem' then 'high' else 'normal' end,
          now() + make_interval(hours => private.support_sla_hours(p_topic)), p_idempotency_key)
  returning id into v_id;
  insert into public.support_messages (ticket_id, author_id, side, body) values (v_id, v_uid, 'customer', btrim(p_body));
  return v_id;
end;
$$;

create or replace function public.post_support_message(p_ticket_id uuid, p_body text, p_internal boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t       public.support_tickets%rowtype;
  v_uid   uuid := auth.uid();
  v_agent boolean := public.has_platform_permission('support.manage');
  v_id    uuid;
begin
  select * into t from public.support_tickets where id = p_ticket_id for update;
  if not found or (t.customer_id <> v_uid and not v_agent) then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Write a message' using errcode = '22023';
  end if;

  if t.customer_id = v_uid and not (v_agent and p_internal) then
    -- The customer (an agent opening their own ticket counts as the customer here).
    if t.status = 'closed' then
      raise exception 'This request is closed. Open a new one if you still need help' using errcode = '22023';
    end if;
    insert into public.support_messages (ticket_id, author_id, side, body)
    values (t.id, v_uid, 'customer', btrim(p_body)) returning id into v_id;
    if t.status in ('waiting_customer', 'resolved') then
      update public.support_tickets set status = 'open', resolved_at = null where id = t.id;
    end if;
    return v_id;
  end if;

  insert into public.support_messages (ticket_id, author_id, side, internal, body)
  values (t.id, v_uid, 'agent', coalesce(p_internal, false), btrim(p_body)) returning id into v_id;
  if not coalesce(p_internal, false) then
    update public.support_tickets
       set first_response_at = coalesce(first_response_at, now()),
           status = case when status = 'open' then 'waiting_customer' else status end,
           assigned_to = coalesce(assigned_to, v_uid)
     where id = t.id;
    perform private.notify(t.customer_id, 'bookings', 'support.replied',
                           jsonb_build_object('ref', t.ref_no), '/account/support/' || t.id);
  end if;
  return v_id;
end;
$$;

create or replace function public.update_support_ticket(
  p_ticket_id   uuid,
  p_status      text,
  p_priority    text,
  p_assigned_to uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.support_tickets%rowtype;
begin
  if not public.has_platform_permission('support.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into t from public.support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if p_status not in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')
     or p_priority not in ('normal', 'high') then
    raise exception 'Unknown status or priority' using errcode = '22023';
  end if;
  if p_assigned_to is not null and not exists (
       select 1 from public.user_role_assignments a
       join public.role_permissions rp on rp.role_id = a.role_id
       join public.permissions p on p.id = rp.permission_id
       where a.user_id = p_assigned_to and p.code = 'support.manage') then
    raise exception 'That person cannot handle support requests' using errcode = '22023';
  end if;
  update public.support_tickets
     set status = p_status, priority = p_priority, assigned_to = p_assigned_to,
         resolved_at = case when p_status in ('resolved', 'closed') then coalesce(resolved_at, now()) end
   where id = t.id;
  if p_status is distinct from t.status and p_status in ('resolved', 'closed') then
    perform private.notify(t.customer_id, 'bookings', 'support.resolved',
                           jsonb_build_object('ref', t.ref_no), '/account/support/' || t.id);
  end if;
end;
$$;

-- Everything an agent needs on one screen: the booking, its conversation with the
-- vendor, payments, refunds and the ticket's audit trail.
create or replace function public.support_ticket_context(p_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t  public.support_tickets%rowtype;
  b  public.booking_items%rowtype;
  o  public.organizations%rowtype;
  bp public.business_profiles%rowtype;
begin
  if not public.has_platform_permission('support.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into t from public.support_tickets where id = p_ticket_id;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  select * into b from public.booking_items where id = t.booking_item_id;
  select * into o from public.organizations where id = b.organization_id;
  select * into bp from public.business_profiles where organization_id = b.organization_id;

  return jsonb_build_object(
    'customer', (select jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email, 'phone', p.phone)
                 from public.profiles p where p.id = t.customer_id),
    'booking', case when b.id is null then null else jsonb_build_object(
        'id', b.id, 'status', b.status, 'event_date', b.event_date, 'period', b.period::text, 'guests', b.guests,
        'total_paise', b.total_paise, 'advance_paise', b.advance_paise, 'paid_paise', b.paid_paise,
        'refund_due_paise', b.refund_due_paise, 'balance_due_on', b.balance_due_on, 'currency', b.currency,
        'cancellation_policy', b.cancellation_policy, 'cancel_reason', b.cancel_reason,
        'cancelled_by_side', b.cancelled_by_side, 'enquiry_id', b.enquiry_id,
        'listing', b.snapshot -> 'listing' ->> 'title', 'vendor', o.name, 'vendor_id', o.id,
        'vendor_phone', bp.contact_phone, 'vendor_email', bp.contact_email::text) end,
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'method', p.method,
                                   'status', p.status, 'amount_paise', p.amount_paise, 'paid_at', p.paid_at,
                                   'created_at', p.created_at) order by p.created_at)
                          from public.payments p where p.booking_item_id = b.id), '[]'::jsonb),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status,
                                  'amount_paise', r.amount_paise, 'created_at', r.created_at) order by r.created_at)
                         from public.refunds r where r.booking_item_id = b.id), '[]'::jsonb),
    'vendor_messages', coalesce((select jsonb_agg(x order by x ->> 'created_at') from (
                                   select jsonb_build_object('side', m.sender_side,
                                          'body', m.body, 'created_at', m.created_at) x
                                   from public.enquiry_messages m where m.enquiry_id = b.enquiry_id
                                   order by m.created_at desc limit 50) s), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', a.occurred_at, 'action', a.action,
                                  'fields', a.changed_fields, 'status', a.new_data ->> 'status',
                                  'actor', (select full_name from public.profiles where id = a.actor_user_id))
                                  order by a.occurred_at)
                         from public.audit_logs a
                         where a.entity_table = 'support_tickets' and a.entity_id = t.id::text), '[]'::jsonb)
  );
end;
$$;

-- People who can be assigned support requests (for the agent dropdown).
create or replace function public.support_agents()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.id, coalesce(p.full_name, p.email::text)
  from public.user_role_assignments a
  join public.role_permissions rp on rp.role_id = a.role_id
  join public.permissions pm on pm.id = rp.permission_id and pm.code = 'support.manage'
  join public.profiles p on p.id = a.user_id
  where public.has_platform_permission('support.manage')
  order by 2;
$$;

-- ======================================================================================
-- Daily nudges (09:00 India time): balance reminders and review requests
-- ======================================================================================
create or replace function public.send_daily_nudges()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today     date := (now() at time zone 'Asia/Kolkata')::date;
  b           public.booking_items%rowtype;
  rec         record;
  v_reminders int := 0;
  v_reviews   int := 0;
begin
  if not private.is_system_caller() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  for rec in
    select bi.id, bi.customer_id, bi.snapshot, bi.total_paise, bi.paid_paise, bi.balance_due_on,
           (bi.balance_due_on - v_today) as days
    from public.booking_items bi
    where bi.status = 'confirmed' and bi.paid_paise < bi.total_paise
      and bi.balance_due_on - v_today in (7, 1)
      and not exists (select 1 from public.payment_reminders pr
                      where pr.booking_item_id = bi.id and pr.days_before = bi.balance_due_on - v_today
                        and pr.due_on = bi.balance_due_on)
  loop
    insert into public.payment_reminders (booking_item_id, days_before, due_on) values (rec.id, rec.days, rec.balance_due_on);
    perform private.notify(rec.customer_id, 'payments', 'payment.reminder',
                           jsonb_build_object('listing', rec.snapshot -> 'listing' ->> 'title',
                                              'amount_paise', rec.total_paise - rec.paid_paise,
                                              'date', rec.balance_due_on, 'count', rec.days),
                           '/account/bookings/' || rec.id);
    v_reminders := v_reminders + 1;
  end loop;

  for b in
    select bi.* from public.booking_items bi
    where bi.status = 'confirmed' and bi.review_requested_at is null
      and bi.event_date < v_today and bi.event_date >= v_today - 30
      and not exists (select 1 from public.reviews r where r.booking_item_id = bi.id)
  loop
    update public.booking_items set review_requested_at = now() where id = b.id;
    perform private.notify(b.customer_id, 'bookings', 'review.request',
                           jsonb_build_object('listing', b.snapshot -> 'listing' ->> 'title',
                                              'vendor', b.snapshot -> 'listing' ->> 'vendor_name'),
                           '/account/bookings/' || b.id || '?review=1');
    v_reviews := v_reviews + 1;
  end loop;

  return jsonb_build_object('reminders', v_reminders, 'review_requests', v_reviews);
end;
$$;

revoke all on function public.send_daily_nudges() from public, anon, authenticated;
grant execute on function public.send_daily_nudges() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('daily-customer-nudges', '30 3 * * *', 'select public.send_daily_nudges()');
  else
    raise notice 'pg_cron not available; schedule public.send_daily_nudges() externally';
  end if;
end;
$$;

revoke all on all functions in schema private from public, anon;
-- Used by the service_packages check constraint, so callers need it (batch 2 relied on PUBLIC).
grant execute on function private.valid_package_lines(text[]) to authenticated, service_role;
