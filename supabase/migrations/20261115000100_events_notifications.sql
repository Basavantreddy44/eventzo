-- =============================================================================
-- 20261115000100 · Phase 6: event workspace, guests/RSVP, notifications
-- =============================================================================
-- • events group a customer's enquiries and bookings (one event → many
--   independent vendor bookings); co-hosts edit, viewers only read.
-- • guest list with a private RSVP link per guest (no login needed).
-- • event budget lines (planned per category; booked/paid come from bookings).
-- • in-app notifications + an outbox for WhatsApp/email (enhancement C). Only
--   users with a current WhatsApp opt-in (consent_records) and a phone get
--   WhatsApp messages. Delivery happens outside the database (provider adapter
--   or the dev simulator).

-- ---------- enums --------------------------------------------------------------------
create type public.event_status    as enum ('planning', 'completed', 'cancelled');
create type public.event_role      as enum ('owner', 'cohost', 'viewer');
create type public.rsvp_status     as enum ('pending', 'attending', 'maybe', 'declined');
create type public.delivery_status as enum ('queued', 'sent', 'failed', 'skipped');

-- ---------- events -------------------------------------------------------------------
create table public.events (
  id                 uuid primary key default extensions.gen_random_uuid(),
  owner_id           uuid not null references public.profiles (id) on delete cascade,
  title              text not null check (char_length(trim(title)) between 2 and 120),
  event_type         text not null check (event_type in ('wedding', 'engagement', 'reception', 'haldi_mehendi', 'birthday',
                                                          'naming_ceremony', 'housewarming', 'anniversary', 'corporate', 'other')),
  city_id            uuid references public.cities (id) on delete set null,
  start_date         date not null,
  end_date           date not null,
  guest_estimate     int check (guest_estimate between 1 and 100000),
  status             public.event_status not null default 'planning',
  hosts_text         text check (char_length(hosts_text) <= 200),        -- "Ramesh & Sunita Patil"
  venue_text         text check (char_length(venue_text) <= 300),        -- shown on invitations
  invitation_message text check (char_length(invitation_message) <= 1000),
  currency           char(3) not null default 'INR',
  idempotency_key    text check (char_length(idempotency_key) between 8 and 100),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (end_date >= start_date and end_date <= start_date + 30),
  unique (owner_id, idempotency_key)
);
create index events_owner_idx on public.events (owner_id, start_date);

create table public.event_members (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.event_role not null,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create unique index event_members_one_owner on public.event_members (event_id) where role = 'owner';
create index event_members_user_idx on public.event_members (user_id);

create table public.event_invitations (
  id           uuid primary key default extensions.gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  email        extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  role         public.event_role not null check (role in ('cohost', 'viewer')),
  status       public.invitation_status not null default 'pending',
  invited_by   uuid references public.profiles (id) on delete set null,
  expires_at   timestamptz not null default now() + interval '14 days',
  responded_at timestamptz,
  accepted_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index event_invitations_one_pending on public.event_invitations (event_id, email) where status = 'pending';
create index event_invitations_email_idx on public.event_invitations (email) where status = 'pending';

-- Guests. invite_token is the guest's private RSVP credential: only editors can
-- read it (column grant + guest_invite_token()); anyone holding it can RSVP.
create table public.event_guests (
  id              uuid primary key default extensions.gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 1 and 120),
  phone           text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  email           extensions.citext check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  group_label     text check (char_length(group_label) <= 60),
  party_size      int not null default 1 check (party_size between 1 and 50),
  rsvp_status     public.rsvp_status not null default 'pending',
  attending_count int not null default 0 check (attending_count between 0 and 50),
  rsvp_note       text check (char_length(rsvp_note) <= 500),
  responded_at    timestamptz,
  invite_token    text unique check (invite_token ~ '^[A-Za-z0-9_-]{32}$'),
  invited_at      timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (attending_count <= party_size),
  check (rsvp_status in ('attending', 'maybe') or attending_count = 0)
);
create index event_guests_event_idx on public.event_guests (event_id, name);

create table public.event_budget_lines (
  id                   uuid primary key default extensions.gen_random_uuid(),
  event_id             uuid not null references public.events (id) on delete cascade,
  business_category_id uuid references public.business_categories (id) on delete cascade,
  label                text check (char_length(trim(label)) between 1 and 80),
  planned_paise        bigint not null default 0 check (planned_paise between 0 and 100000000000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((business_category_id is null) <> (label is null))
);
create unique index event_budget_lines_category on public.event_budget_lines (event_id, business_category_id)
  where business_category_id is not null;
create unique index event_budget_lines_label on public.event_budget_lines (event_id, lower(label)) where label is not null;

-- Link enquiries and bookings to an event.
alter table public.enquiries add column event_id uuid references public.events (id) on delete set null;
create index enquiries_event_idx on public.enquiries (event_id) where event_id is not null;
alter table public.bookings
  add constraint bookings_event_fk foreign key (event_id) references public.events (id) on delete set null;
create index bookings_event_idx on public.bookings (event_id) where event_id is not null;

create trigger events_set_updated_at             before update on public.events             for each row execute function public.set_updated_at();
create trigger event_invitations_set_updated_at  before update on public.event_invitations  for each row execute function public.set_updated_at();
create trigger event_guests_set_updated_at       before update on public.event_guests       for each row execute function public.set_updated_at();
create trigger event_budget_lines_set_updated_at before update on public.event_budget_lines for each row execute function public.set_updated_at();
create trigger audit_events            after insert or update or delete on public.events            for each row execute function private.audit_row_change();
create trigger audit_event_members     after insert or update or delete on public.event_members     for each row execute function private.audit_row_change();
create trigger audit_event_invitations after insert or update or delete on public.event_invitations for each row execute function private.audit_row_change();

-- Abuse guard: at most 2000 guests per event.
create or replace function private.limit_event_guests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.event_guests g where g.event_id = new.event_id) >= 2000 then
    raise exception 'An event can have up to 2000 guests' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger event_guests_limit before insert on public.event_guests for each row execute function private.limit_event_guests();

-- ---------- access helpers ------------------------------------------------------------
create or replace function private.event_role(p_event_id uuid)
returns public.event_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.event_members m where m.event_id = p_event_id and m.user_id = (select auth.uid());
$$;

create or replace function private.can_view_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.event_role(p_event_id) is not null;
$$;

create or replace function private.can_edit_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.event_role(p_event_id) in ('owner', 'cohost'), false);
$$;

-- ---------- RLS ------------------------------------------------------------------------
alter table public.events             enable row level security;
alter table public.event_members      enable row level security;
alter table public.event_invitations  enable row level security;
alter table public.event_guests       enable row level security;
alter table public.event_budget_lines enable row level security;
revoke all on public.events, public.event_members, public.event_invitations, public.event_guests, public.event_budget_lines
  from anon, authenticated;

grant select on public.events, public.event_members, public.event_invitations, public.event_budget_lines to authenticated;
grant update (title, event_type, city_id, start_date, end_date, guest_estimate, hosts_text, venue_text, invitation_message)
  on public.events to authenticated;
grant insert (event_id, business_category_id, label, planned_paise), update (planned_paise), delete
  on public.event_budget_lines to authenticated;
-- invite_token is deliberately not selectable (guest_invite_token() hands it to editors).
grant select (id, event_id, name, phone, email, group_label, party_size, rsvp_status, attending_count, rsvp_note,
              responded_at, invited_at, created_by, created_at, updated_at)
  on public.event_guests to authenticated;
grant insert (event_id, name, phone, email, group_label, party_size, created_by),
      update (name, phone, email, group_label, party_size, rsvp_status, attending_count, rsvp_note),
      delete
  on public.event_guests to authenticated;

create policy events_select on public.events for select to authenticated using (private.can_view_event(id));
create policy events_update on public.events for update to authenticated
  using (private.can_edit_event(id)) with check (private.can_edit_event(id));

create policy event_members_select on public.event_members for select to authenticated
  using (private.can_view_event(event_id));

create policy event_invitations_select on public.event_invitations for select to authenticated
  using (private.event_role(event_id) = 'owner' or email = private.caller_email());

create policy event_guests_select on public.event_guests for select to authenticated
  using (private.can_view_event(event_id));
create policy event_guests_insert on public.event_guests for insert to authenticated
  with check (private.can_edit_event(event_id) and created_by = (select auth.uid()));
create policy event_guests_update on public.event_guests for update to authenticated
  using (private.can_edit_event(event_id)) with check (private.can_edit_event(event_id));
create policy event_guests_delete on public.event_guests for delete to authenticated
  using (private.can_edit_event(event_id));

create policy event_budget_lines_select on public.event_budget_lines for select to authenticated
  using (private.can_view_event(event_id));
create policy event_budget_lines_insert on public.event_budget_lines for insert to authenticated
  with check (private.can_edit_event(event_id));
create policy event_budget_lines_update on public.event_budget_lines for update to authenticated
  using (private.can_edit_event(event_id)) with check (private.can_edit_event(event_id));
create policy event_budget_lines_delete on public.event_budget_lines for delete to authenticated
  using (private.can_edit_event(event_id));

-- Co-hosts of the event an enquiry belongs to can read it and its thread and
-- quotes (viewers only see the event's vendor summary).
create or replace function private.can_view_enquiry(p_enquiry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.enquiries e
           where e.id = p_enquiry_id
             and (e.customer_id = (select auth.uid())
                  or (e.event_id is not null and private.can_edit_event(e.event_id))))
      or private.can_manage_enquiry(p_enquiry_id);
$$;

drop policy enquiries_select on public.enquiries;
create policy enquiries_select on public.enquiries for select to authenticated
  using (customer_id = (select auth.uid())
         or private.can_manage_resource(organization_id, branch_id)
         or (event_id is not null and private.can_edit_event(event_id)));

-- ---------- event RPCs ------------------------------------------------------------------
create or replace function public.create_event(
  p_title           text,
  p_event_type      text,
  p_city_id         uuid,
  p_start_date      date,
  p_end_date        date,
  p_guest_estimate  int,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;
  select id into v_id from public.events where owner_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return v_id;
  end if;
  if p_start_date is null or p_start_date < current_date - 1 or p_start_date > current_date + 1095 then
    raise exception 'Choose a date within the next three years' using errcode = '22023';
  end if;
  if (select count(*) from public.events e where e.owner_id = v_uid and e.status = 'planning') >= 50 then
    raise exception 'Too many events in planning' using errcode = '54000';
  end if;

  insert into public.events (owner_id, title, event_type, city_id, start_date, end_date, guest_estimate, idempotency_key)
  values (v_uid, trim(p_title), p_event_type, p_city_id, p_start_date, coalesce(p_end_date, p_start_date),
          p_guest_estimate, p_idempotency_key)
  returning id into v_id;
  insert into public.event_members (event_id, user_id, role, added_by) values (v_id, v_uid, 'owner', v_uid);
  return v_id;
end;
$$;

/** Owner marks the event completed / cancelled / back to planning. Vendor bookings are untouched (each is independent). */
create or replace function public.set_event_status(p_event_id uuid, p_status public.event_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.event_role(p_event_id) is distinct from 'owner' then
    raise exception 'Only the event owner can do this' using errcode = '42501';
  end if;
  update public.events set status = p_status where id = p_event_id;
end;
$$;

create or replace function public.invite_event_member(p_event_id uuid, p_email text, p_role public.event_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext := lower(trim(coalesce(p_email, '')));
  v_id    uuid;
begin
  if private.event_role(p_event_id) is distinct from 'owner' then
    raise exception 'Only the event owner can invite people' using errcode = '42501';
  end if;
  if p_role not in ('cohost', 'viewer') then
    raise exception 'Invite as co-host or viewer' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email' using errcode = '22023';
  end if;
  if exists (select 1 from public.event_members m join public.profiles p on p.id = m.user_id
             where m.event_id = p_event_id and p.email = v_email) then
    raise exception 'This person is already part of the event' using errcode = '23505';
  end if;
  if (select count(*) from public.event_invitations i
      where i.event_id = p_event_id and i.created_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many invitations today' using errcode = '54000';
  end if;

  update public.event_invitations
     set status = 'expired'
   where event_id = p_event_id and email = v_email and status = 'pending' and expires_at < now();

  insert into public.event_invitations (event_id, email, role, invited_by)
  values (p_event_id, v_email, p_role, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.revoke_event_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
begin
  select event_id into v_event from public.event_invitations where id = p_invitation_id;
  if v_event is null or private.event_role(v_event) is distinct from 'owner' then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  update public.event_invitations set status = 'revoked', responded_at = now()
   where id = p_invitation_id and status = 'pending';
end;
$$;

create or replace function public.respond_event_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.event_invitations%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_inv from public.event_invitations where id = p_invitation_id for update;
  if not found or v_inv.email is distinct from private.caller_email() then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'This invitation is no longer open' using errcode = '22023';
  end if;
  if v_inv.expires_at < now() then
    update public.event_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'This invitation has expired' using errcode = '22023';
  end if;
  if not p_accept then
    update public.event_invitations set status = 'declined', responded_at = now() where id = v_inv.id;
    return v_inv.event_id;
  end if;

  -- Never downgrade the owner; an existing member takes the invited role.
  insert into public.event_members (event_id, user_id, role, added_by)
  values (v_inv.event_id, v_uid, v_inv.role, v_inv.invited_by)
  on conflict (event_id, user_id) do update set role = excluded.role
    where public.event_members.role <> 'owner';
  update public.event_invitations set status = 'accepted', responded_at = now(), accepted_by = v_uid where id = v_inv.id;
  return v_inv.event_id;
end;
$$;

create or replace function public.my_event_invitations()
returns table (id uuid, event_id uuid, event_title text, start_date date, role public.event_role,
               invited_by_name text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.event_id, e.title, e.start_date, i.role,
         coalesce(p.display_name, p.full_name), i.expires_at
  from public.event_invitations i
  join public.events e on e.id = i.event_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = private.caller_email() and i.status = 'pending' and i.expires_at > now()
  order by i.created_at desc;
$$;

/** Members of an event. Only the owner sees emails. */
create or replace function public.event_member_directory(p_event_id uuid)
returns table (user_id uuid, name text, email text, role public.event_role, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner boolean := private.event_role(p_event_id) = 'owner';
begin
  if not private.can_view_event(p_event_id) then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  return query
  select m.user_id, coalesce(p.display_name, p.full_name, 'Member'),
         case when v_owner or m.user_id = auth.uid() then p.email::text end,
         m.role, m.created_at
  from public.event_members m join public.profiles p on p.id = m.user_id
  where m.event_id = p_event_id
  order by (m.role = 'owner') desc, m.created_at;
end;
$$;

/** Owner removes a member, or a member leaves. The owner can't leave. */
create or replace function public.remove_event_member(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.event_role;
begin
  select role into v_role from public.event_members where event_id = p_event_id and user_id = p_user_id;
  if v_role is null or not (private.event_role(p_event_id) = 'owner' or p_user_id = auth.uid()) then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if v_role = 'owner' then
    raise exception 'The owner cannot be removed' using errcode = '42501';
  end if;
  delete from public.event_members where event_id = p_event_id and user_id = p_user_id;
end;
$$;

/**
 * Customer files an enquiry (and its booking) under one of their own events, or
 * removes it (p_event_id null). Only the event owner's enquiries can be linked,
 * so the person who pays is always the event owner.
 */
create or replace function public.set_enquiry_event(p_enquiry_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.enquiries e where e.id = p_enquiry_id and e.customer_id = v_uid) then
    raise exception 'Enquiry not found' using errcode = 'P0002';
  end if;
  if p_event_id is not null and not exists (select 1 from public.events ev where ev.id = p_event_id and ev.owner_id = v_uid) then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  update public.enquiries set event_id = p_event_id where id = p_enquiry_id;
  update public.bookings b set event_id = p_event_id
    from public.booking_items bi
   where bi.booking_id = b.id and bi.enquiry_id = p_enquiry_id;
end;
$$;

/** The vendors of an event: each enquiry with its booking (if any). Visible to all members. */
create or replace function public.event_vendors(p_event_id uuid)
returns table (
  enquiry_id           uuid,
  booking_item_id      uuid,
  listing_title        text,
  vendor_name          text,
  business_category_id uuid,
  category_slug        text,
  event_date           date,
  enquiry_status       text,
  booking_status       text,
  currency             char(3),
  total_paise          bigint,
  paid_paise           bigint,
  refunded_paise       bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_view_event(p_event_id) then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  return query
  select e.id, bi.id, coalesce(s.title, e.price_snapshot ->> 'title'), o.name,
         bc.id, bc.slug::text, e.event_date, e.status::text, bi.status::text,
         coalesce(bi.currency, 'INR')::char(3), bi.total_paise, bi.paid_paise,
         coalesce((select sum(r.amount_paise) from public.refunds r
                   where r.booking_item_id = bi.id and r.status = 'processed'), 0)::bigint
  from public.enquiries e
  join public.services s on s.id = e.service_id
  join public.organizations o on o.id = e.organization_id
  join public.service_categories sc on sc.id = s.service_category_id
  join public.business_categories bc on bc.id = sc.business_category_id
  left join public.booking_items bi on bi.enquiry_id = e.id
  where e.event_id = p_event_id
  order by e.event_date, e.created_at;
end;
$$;

-- ---------- guests & RSVP -----------------------------------------------------------------
create or replace function private.new_invite_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
$$;

/** Editors get (or regenerate, revoking the old link) a guest's private RSVP token. */
create or replace function public.guest_invite_token(p_guest_id uuid, p_regenerate boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.event_guests%rowtype;
begin
  select * into g from public.event_guests where id = p_guest_id for update;
  if not found or not private.can_edit_event(g.event_id) then
    raise exception 'Guest not found' using errcode = 'P0002';
  end if;
  if g.invite_token is null or p_regenerate then
    update public.event_guests set invite_token = private.new_invite_token() where id = g.id
    returning invite_token into g.invite_token;
  end if;
  return g.invite_token;
end;
$$;

/** Marks guests as invited (the host shared their link). */
create or replace function public.mark_guests_invited(p_guest_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.event_guests g set invited_at = coalesce(g.invited_at, now())
   where g.id = any(p_guest_ids) and private.can_edit_event(g.event_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function private.rsvp_open(p_event public.events)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_event.status = 'planning'
     and p_event.end_date >= (now() at time zone coalesce(
           (select c.timezone from public.cities c where c.id = p_event.city_id), 'Asia/Kolkata'))::date;
$$;

/** Public: the invitation behind a guest's link. Empty when the link is unknown or revoked. */
create or replace function public.invitation_by_token(p_token text)
returns table (
  event_title        text,
  event_type         text,
  start_date         date,
  end_date           date,
  city_name          text,
  hosts_text         text,
  venue_text         text,
  invitation_message text,
  guest_name         text,
  party_size         int,
  rsvp_status        public.rsvp_status,
  attending_count    int,
  rsvp_note          text,
  rsvp_open          boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.title, e.event_type, e.start_date, e.end_date, c.name, e.hosts_text, e.venue_text, e.invitation_message,
         g.name, g.party_size, g.rsvp_status, g.attending_count, g.rsvp_note, private.rsvp_open(e)
  from public.event_guests g
  join public.events e on e.id = g.event_id
  left join public.cities c on c.id = e.city_id
  where p_token ~ '^[A-Za-z0-9_-]{32}$' and g.invite_token = p_token and e.status <> 'cancelled';
$$;

-- ---------- notifications -------------------------------------------------------------------
alter table public.notification_preferences drop constraint notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('account', 'bookings', 'messages', 'payments', 'reminders', 'marketing', 'events'));

create table public.notifications (
  id         uuid primary key default extensions.gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  category   text not null check (category in ('account', 'bookings', 'messages', 'payments', 'reminders', 'events')),
  kind       text not null check (kind ~ '^[a-z_]+\.[a-z_]+$'),
  params     jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  link       text check (link ~ '^/[A-Za-z0-9/_.?=&-]*$' and char_length(link) <= 300),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- Messages waiting for an external channel. user_id is null for people without
-- an account (e.g. an emailed co-host invitation).
create table public.notification_outbox (
  id                  uuid primary key default extensions.gen_random_uuid(),
  notification_id     uuid references public.notifications (id) on delete set null,
  user_id             uuid references public.profiles (id) on delete cascade,
  channel             public.notification_channel not null check (channel in ('whatsapp', 'email', 'sms')),
  to_address          text not null check (char_length(to_address) between 3 and 254),
  template            text not null check (template ~ '^[a-z_]+\.[a-z_]+$'),
  locale              public.app_locale not null default 'en',
  params              jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  status              public.delivery_status not null default 'queued',
  attempts            int not null default 0,
  next_attempt_at     timestamptz not null default now(),
  provider            text check (char_length(provider) <= 40),
  provider_message_id text check (char_length(provider_message_id) <= 200),
  last_error          text check (char_length(last_error) <= 1000),
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index notification_outbox_queue_idx on public.notification_outbox (next_attempt_at) where status = 'queued';
create index notification_outbox_created_idx on public.notification_outbox (created_at desc);
create trigger notification_outbox_set_updated_at before update on public.notification_outbox
  for each row execute function public.set_updated_at();

insert into public.permissions (code, description) values
  ('notifications.manage', 'See and process the WhatsApp/email outbox');
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where p.code = 'notifications.manage' and r.code in ('super_admin', 'support_agent');

alter table public.notifications       enable row level security;
alter table public.notification_outbox enable row level security;
revoke all on public.notifications, public.notification_outbox from anon, authenticated;
grant select on public.notifications, public.notification_outbox to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_outbox_select on public.notification_outbox for select to authenticated
  using (public.has_platform_permission('notifications.manage'));

-- Live unread badge (Supabase Realtime honours RLS). Skipped where the publication doesn't exist.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- WhatsApp opt-in: the latest consent record for (whatsapp_updates, whatsapp) decides.
create or replace function private.has_whatsapp_consent(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.granted from public.consent_records c
                   where c.user_id = p_user_id and c.purpose = 'whatsapp_updates' and c.channel = 'whatsapp'
                   order by c.created_at desc, c.id desc limit 1), false);
$$;

-- Per-category switch; when the user never chose, in-app/WhatsApp default on and
-- email defaults on except for chat messages.
create or replace function private.channel_enabled(p_user_id uuid, p_channel public.notification_channel, p_category text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select np.enabled from public.notification_preferences np
     where np.user_id = p_user_id and np.channel = p_channel and np.category = p_category),
    not (p_channel = 'email' and p_category = 'messages'));
$$;

/**
 * Creates the in-app notification and queues WhatsApp/email copies. Never
 * raises: a notification problem must not undo a booking or payment.
 */
create or replace function private.notify(
  p_user_id  uuid,
  p_category text,
  p_kind     text,
  p_params   jsonb,
  p_link     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  p        public.profiles%rowtype;
  v_params jsonb := coalesce(p_params, '{}'::jsonb) || jsonb_build_object('link', p_link);
begin
  if p_user_id is null then
    return;
  end if;
  begin
    if private.channel_enabled(p_user_id, 'in_app', p_category) then
      insert into public.notifications (user_id, category, kind, params, link)
      values (p_user_id, p_category, p_kind, coalesce(p_params, '{}'::jsonb), p_link)
      returning id into v_id;
    end if;

    select * into p from public.profiles where id = p_user_id;
    if p.phone is not null and private.has_whatsapp_consent(p_user_id)
       and private.channel_enabled(p_user_id, 'whatsapp', p_category) then
      insert into public.notification_outbox (notification_id, user_id, channel, to_address, template, locale, params)
      values (v_id, p_user_id, 'whatsapp', p.phone, p_kind, p.preferred_locale, v_params);
    end if;
    if p.email is not null and private.channel_enabled(p_user_id, 'email', p_category) then
      insert into public.notification_outbox (notification_id, user_id, channel, to_address, template, locale, params)
      values (v_id, p_user_id, 'email', p.email::text, p_kind, p.preferred_locale, v_params);
    end if;
  exception when others then
    raise warning 'notify(%) failed: %', p_kind, sqlerrm;
  end;
end;
$$;

-- Vendor side recipients: owners, plus branch managers of the branch.
create or replace function private.notify_vendor(
  p_organization_id uuid,
  p_branch_id       uuid,
  p_category        text,
  p_kind            text,
  p_params          jsonb,
  p_link            text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select m.user_id from public.organization_members m
    where m.organization_id = p_organization_id and m.status = 'active'
      and (m.role = 'owner'
           or (m.role = 'branch_manager' and p_branch_id is not null
               and exists (select 1 from public.member_branch_access a where a.member_id = m.id and a.branch_id = p_branch_id)))
  loop
    perform private.notify(v_user, p_category, p_kind, p_params, p_link);
  end loop;
end;
$$;

-- Event owner + co-hosts (except the person who caused it).
create or replace function private.notify_event_editors(
  p_event_id uuid, p_except uuid, p_kind text, p_params jsonb, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select m.user_id from public.event_members m
    where m.event_id = p_event_id and m.role in ('owner', 'cohost') and m.user_id is distinct from p_except
  loop
    perform private.notify(v_user, 'events', p_kind, p_params, p_link);
  end loop;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/** Records a WhatsApp opt-in / opt-out (append-only consent history). */
create or replace function public.set_whatsapp_consent(p_granted boolean, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_granted and (select phone from public.profiles where id = auth.uid()) is null then
    raise exception 'Add your mobile number first' using errcode = '22023';
  end if;
  -- clock_timestamp(): several changes in one transaction still order correctly.
  insert into public.consent_records (user_id, purpose, channel, granted, source, user_agent, created_at)
  values (auth.uid(), 'whatsapp_updates', 'whatsapp', p_granted, 'settings', left(p_user_agent, 500), clock_timestamp());
end;
$$;

/** Public RSVP from a guest's private link. */
create or replace function public.respond_rsvp(p_token text, p_status public.rsvp_status, p_count int, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.event_guests%rowtype;
  e public.events%rowtype;
  v_count int := case when p_status in ('attending', 'maybe') then coalesce(p_count, 1) else 0 end;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  select * into g from public.event_guests where invite_token = p_token for update;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  select * into e from public.events where id = g.event_id;
  if e.status = 'cancelled' then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if not private.rsvp_open(e) then
    raise exception 'RSVP has closed for this event' using errcode = '22023';
  end if;
  if p_status = 'pending' then
    raise exception 'Choose attending, maybe or not attending' using errcode = '22023';
  end if;
  if v_count < 0 or v_count > g.party_size or (p_status = 'attending' and v_count < 1) then
    raise exception 'Headcount must be between 1 and %', g.party_size using errcode = '22023';
  end if;
  if char_length(p_note) > 500 then
    raise exception 'Keep the note under 500 characters' using errcode = '22023';
  end if;

  update public.event_guests
     set rsvp_status = p_status, attending_count = v_count, rsvp_note = nullif(trim(coalesce(p_note, '')), ''),
         responded_at = now()
   where id = g.id;

  if g.rsvp_status is distinct from p_status or g.attending_count is distinct from v_count then
    perform private.notify_event_editors(e.id, null, 'rsvp.received',
      jsonb_build_object('guest', g.name, 'event', e.title, 'status', p_status, 'count', v_count),
      '/account/events/' || e.id || '?tab=guests');
  end if;
end;
$$;

-- ---------- outbox processing (service role) ---------------------------------------------------
/** Claims due messages for delivery (skips rows another worker holds). */
create or replace function public.claim_outbox(p_limit int default 25)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_system_caller() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  update public.notification_outbox o
     set attempts = o.attempts + 1, next_attempt_at = now() + interval '10 minutes'
   where o.id in (select q.id from public.notification_outbox q
                  where q.status = 'queued' and q.next_attempt_at <= now()
                  order by q.next_attempt_at limit least(greatest(coalesce(p_limit, 25), 1), 100)
                  for update skip locked)
  returning o.*;
end;
$$;

/** Records a delivery result. Failures retry with backoff, up to 5 attempts. */
create or replace function public.complete_outbox(
  p_id uuid, p_success boolean, p_provider text, p_provider_message_id text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_system_caller() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.notification_outbox o
     set status = case when p_success then 'sent'::public.delivery_status
                       when o.attempts >= 5 then 'failed'::public.delivery_status
                       else 'queued'::public.delivery_status end,
         provider = left(p_provider, 40),
         provider_message_id = left(p_provider_message_id, 200),
         last_error = case when p_success then null else left(p_error, 1000) end,
         sent_at = case when p_success then now() end,
         next_attempt_at = case when p_success then o.next_attempt_at
                                else now() + make_interval(mins => 5 * o.attempts * o.attempts) end
   where o.id = p_id;
end;
$$;

-- ---------- notification triggers ------------------------------------------------------------
create or replace function private.notify_enquiry_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_params jsonb := jsonb_build_object('listing', new.price_snapshot ->> 'title', 'date', new.event_date);
begin
  if tg_op = 'INSERT' then
    perform private.notify_vendor(new.organization_id, new.branch_id, 'bookings', 'enquiry.new', v_params,
                                  '/vendor/enquiries/' || new.id);
    return null;
  end if;
  if new.status is not distinct from old.status then
    return null;
  end if;
  case new.status::text
    when 'declined' then
      perform private.notify(new.customer_id, 'bookings', 'enquiry.declined', v_params, '/account/enquiries/' || new.id);
    when 'expired' then
      perform private.notify(new.customer_id, 'bookings', 'enquiry.expired', v_params, '/account/enquiries/' || new.id);
    when 'cancelled' then
      perform private.notify_vendor(new.organization_id, new.branch_id, 'bookings', 'enquiry.cancelled', v_params,
                                    '/vendor/enquiries/' || new.id);
    when 'accepted' then
      perform private.notify_vendor(new.organization_id, new.branch_id, 'bookings', 'quote.accepted', v_params,
                                    '/vendor/enquiries/' || new.id);
    else
      null;
  end case;
  return null;
end;
$$;
create trigger enquiries_notify after insert or update of status on public.enquiries
  for each row execute function private.notify_enquiry_change();

create or replace function private.notify_quotation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.enquiries%rowtype;
begin
  select * into e from public.enquiries where id = new.enquiry_id;
  perform private.notify(e.customer_id, 'bookings', 'quote.received',
    jsonb_build_object('listing', e.price_snapshot ->> 'title', 'vendor', e.price_snapshot ->> 'vendor_name',
                       'amount_paise', new.total_paise, 'version', new.version),
    '/account/enquiries/' || e.id);
  return null;
end;
$$;
create trigger quotations_notify after insert on public.quotations
  for each row execute function private.notify_quotation();

create or replace function private.notify_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e        public.enquiries%rowtype;
  v_params jsonb;
  v_user   uuid;
begin
  select * into e from public.enquiries where id = new.enquiry_id;
  v_params := jsonb_build_object('listing', e.price_snapshot ->> 'title', 'vendor', e.price_snapshot ->> 'vendor_name');
  if new.sender_side = 'customer' then
    perform private.notify_vendor(e.organization_id, e.branch_id, 'messages', 'message.from_customer', v_params,
                                  '/vendor/enquiries/' || e.id);
  elsif new.sender_side = 'vendor' then
    perform private.notify(e.customer_id, 'messages', 'message.from_vendor', v_params, '/account/enquiries/' || e.id);
    -- Co-hosts helping with the event follow the conversation too.
    if e.event_id is not null then
      for v_user in select m.user_id from public.event_members m
                    where m.event_id = e.event_id and m.role = 'cohost' and m.user_id <> e.customer_id loop
        perform private.notify(v_user, 'messages', 'message.from_vendor', v_params, '/account/enquiries/' || e.id);
      end loop;
    end if;
  end if;
  return null;
end;
$$;
create trigger enquiry_messages_notify after insert on public.enquiry_messages
  for each row execute function private.notify_message();

create or replace function private.notify_booking_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_params   jsonb := jsonb_build_object('listing', new.snapshot -> 'listing' ->> 'title',
                                         'vendor', new.snapshot -> 'listing' ->> 'vendor_name',
                                         'date', new.event_date, 'amount_paise', new.advance_paise);
  v_customer text := '/account/bookings/' || new.id;
  v_vendor   text := '/vendor/bookings/' || new.id;
begin
  if tg_op = 'INSERT' then
    perform private.notify_vendor(new.organization_id, new.branch_id, 'bookings', 'booking.new', v_params, v_vendor);
    return null;
  end if;
  if new.status is not distinct from old.status then
    return null;
  end if;
  case new.status::text
    when 'confirmed' then
      perform private.notify(new.customer_id, 'bookings', 'booking.confirmed', v_params, v_customer);
      perform private.notify_vendor(new.organization_id, new.branch_id, 'bookings', 'booking.confirmed', v_params, v_vendor);
    when 'expired' then
      perform private.notify(new.customer_id, 'bookings', 'booking.expired', v_params, v_customer);
      perform private.notify_vendor(new.organization_id, new.branch_id, 'bookings', 'booking.expired', v_params, v_vendor);
    when 'cancelled' then
      if new.cancelled_by_side = 'vendor' then
        perform private.notify(new.customer_id, 'bookings', 'booking.cancelled_by_vendor', v_params, v_customer);
      else
        perform private.notify_vendor(new.organization_id, new.branch_id, 'bookings', 'booking.cancelled_by_customer',
                                      v_params, v_vendor);
      end if;
    else
      null;
  end case;
  return null;
end;
$$;
create trigger booking_items_notify after insert or update of status on public.booking_items
  for each row execute function private.notify_booking_change();

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
  perform private.notify(b.customer_id, 'payments', 'payment.received', v_params, '/account/bookings/' || b.id);
  perform private.notify_vendor(b.organization_id, b.branch_id, 'payments', 'payment.received', v_params,
                                '/vendor/bookings/' || b.id);
  return null;
end;
$$;
create trigger payments_notify after insert or update of status on public.payments
  for each row execute function private.notify_payment();

create or replace function private.notify_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.booking_items%rowtype;
begin
  if new.status <> 'processed' or old.status = 'processed' then
    return null;
  end if;
  select * into b from public.booking_items where id = new.booking_item_id;
  perform private.notify(b.customer_id, 'payments', 'refund.processed',
    jsonb_build_object('listing', b.snapshot -> 'listing' ->> 'title', 'amount_paise', new.amount_paise),
    '/account/bookings/' || b.id);
  return null;
end;
$$;
create trigger refunds_notify after update of status on public.refunds
  for each row execute function private.notify_refund();

-- Co-host invitation: in-app for existing accounts, otherwise an email to the address.
create or replace function private.notify_event_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid;
  v_params jsonb;
begin
  select jsonb_build_object('event', e.title, 'role', new.role,
                            'by', coalesce(p.display_name, p.full_name, 'Someone'))
    into v_params
  from public.events e left join public.profiles p on p.id = new.invited_by
  where e.id = new.event_id;

  select id into v_user from public.profiles where email = new.email;
  if v_user is not null then
    perform private.notify(v_user, 'events', 'event.invited', v_params, '/account/events');
  else
    begin
      insert into public.notification_outbox (channel, to_address, template, params)
      values ('email', new.email::text, 'event.invited', v_params || jsonb_build_object('link', '/register'));
    exception when others then
      raise warning 'event invitation email not queued: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;
create trigger event_invitations_notify after insert on public.event_invitations
  for each row execute function private.notify_event_invitation();

-- Co-hosts of the enquiry's event may write in the vendor conversation (on the
-- customer's side). Viewers can't. Otherwise unchanged from Phase 5.
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
  if exists (select 1 from public.enquiries e
             where e.id = p_enquiry_id
               and (e.customer_id = auth.uid()
                    or (e.event_id is not null and private.event_role(e.event_id) = 'cohost'))) then
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

-- ---------- grants ------------------------------------------------------------------------------
grant execute on function private.event_role(uuid)     to authenticated, service_role;
grant execute on function private.can_view_event(uuid) to authenticated, service_role;
grant execute on function private.can_edit_event(uuid) to authenticated, service_role;
grant execute on function private.can_view_enquiry(uuid) to authenticated, service_role;

revoke all on function public.create_event(text, text, uuid, date, date, int, text) from public, anon;
revoke all on function public.set_event_status(uuid, public.event_status) from public, anon;
revoke all on function public.invite_event_member(uuid, text, public.event_role) from public, anon;
revoke all on function public.revoke_event_invitation(uuid) from public, anon;
revoke all on function public.respond_event_invitation(uuid, boolean) from public, anon;
revoke all on function public.my_event_invitations() from public, anon;
revoke all on function public.event_member_directory(uuid) from public, anon;
revoke all on function public.remove_event_member(uuid, uuid) from public, anon;
revoke all on function public.set_enquiry_event(uuid, uuid) from public, anon;
revoke all on function public.event_vendors(uuid) from public, anon;
revoke all on function public.guest_invite_token(uuid, boolean) from public, anon;
revoke all on function public.mark_guests_invited(uuid[]) from public, anon;
revoke all on function public.invitation_by_token(text) from public;
revoke all on function public.respond_rsvp(text, public.rsvp_status, int, text) from public;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
revoke all on function public.set_whatsapp_consent(boolean, text) from public, anon;
revoke all on function public.claim_outbox(int) from public, anon, authenticated;
revoke all on function public.complete_outbox(uuid, boolean, text, text, text) from public, anon, authenticated;

grant execute on function public.create_event(text, text, uuid, date, date, int, text) to authenticated;
grant execute on function public.set_event_status(uuid, public.event_status) to authenticated;
grant execute on function public.invite_event_member(uuid, text, public.event_role) to authenticated;
grant execute on function public.revoke_event_invitation(uuid) to authenticated;
grant execute on function public.respond_event_invitation(uuid, boolean) to authenticated;
grant execute on function public.my_event_invitations() to authenticated;
grant execute on function public.event_member_directory(uuid) to authenticated;
grant execute on function public.remove_event_member(uuid, uuid) to authenticated;
grant execute on function public.set_enquiry_event(uuid, uuid) to authenticated;
grant execute on function public.event_vendors(uuid) to authenticated;
grant execute on function public.guest_invite_token(uuid, boolean) to authenticated;
grant execute on function public.mark_guests_invited(uuid[]) to authenticated;
grant execute on function public.invitation_by_token(text) to anon, authenticated;
grant execute on function public.respond_rsvp(text, public.rsvp_status, int, text) to anon, authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.set_whatsapp_consent(boolean, text) to authenticated;
grant execute on function public.claim_outbox(int) to service_role;
grant execute on function public.complete_outbox(uuid, boolean, text, text, text) to service_role;
