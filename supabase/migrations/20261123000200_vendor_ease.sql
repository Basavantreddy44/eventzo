-- Roadmap Phase C, batch 1 — vendors run the business from a phone.
--   V2   a published venue listing gets its calendar automatically (one exclusive
--        venue space, 2 h setup / 1 h breakdown), so holds work without a
--        "Resources" step
--   V5   hold-expiry nudges to the vendor 24 h and 4 h before an unanswered
--        enquiry's hold lapses; a public response-time figure for listings
--   V8   leads: stage (new / quoted / won / lost), last contact and a
--        follow-up date with a reminder on the day
--   V9   vendor score card (response time, quote-to-booking, rating, cancellations)
--   V11/S4 verification "changes requested" with a reason the vendor sees,
--        and a resubmit step; history stays in the audit log

-- ======================================================================================
-- V11 / S4: changes requested
-- ======================================================================================
alter table public.organizations
  add column verification_note    text check (char_length(verification_note) <= 1000),
  add column verification_note_at timestamptz;

create or replace function public.set_organization_verification(
  p_organization_id uuid,
  p_status public.verification_status,
  p_reason text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    public.organizations%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.has_platform_permission('verification.manage') then
    raise exception 'Not allowed to change verification' using errcode = '42501';
  end if;
  if p_status not in ('verified', 'rejected', 'pending', 'changes_requested') then
    raise exception 'Unsupported verification status' using errcode = '22023';
  end if;
  if p_status in ('rejected', 'changes_requested') and v_reason is null then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if p_status = 'verified' and not exists (
    select 1 from public.business_documents d where d.organization_id = p_organization_id and d.status = 'approved'
  ) then
    raise exception 'Approve at least one document before verifying' using errcode = '23514';
  end if;

  update public.organizations
     set verification_status = p_status,
         verified_at = case when p_status = 'verified' then now() end,
         verification_note = case when p_status in ('rejected', 'changes_requested') then v_reason end,
         verification_note_at = case when p_status in ('rejected', 'changes_requested') then now() end
   where id = p_organization_id
  returning * into v_org;

  if not found then
    raise exception 'Organisation not found' using errcode = 'P0002';
  end if;

  perform private.write_audit('organization.verification_' || p_status::text, 'organizations', p_organization_id::text,
    p_organization_id, null, jsonb_build_object('verification_status', p_status),
    jsonb_build_object('reason', v_reason));

  if p_status = 'verified' then
    perform private.try_activate_organization(p_organization_id);
  elsif v_org.status = 'active' then
    update public.organizations set status = 'draft' where id = p_organization_id;
    perform private.write_audit('organization.deactivated', 'organizations', p_organization_id::text,
      p_organization_id, jsonb_build_object('status', 'active'), jsonb_build_object('status', 'draft'),
      jsonb_build_object('rule', 'verification_' || p_status::text));
  end if;

  if p_status in ('changes_requested', 'rejected', 'verified') then
    perform private.notify_vendor(p_organization_id, null, 'account', 'vendor.' || p_status::text,
                                  jsonb_build_object('vendor', v_org.name, 'reason', coalesce(v_reason, '')),
                                  '/vendor/documents');
  end if;

  select * into v_org from public.organizations where id = p_organization_id;
  return v_org;
end;
$$;

-- A new document after "changes requested" puts the vendor back in the queue.
create or replace function private.mark_verification_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organizations
     set verification_status = 'pending'
   where id = new.organization_id
     and verification_status in ('unverified', 'rejected', 'changes_requested');
  return new;
end;
$$;

/** The owner says "I've fixed it": back to the review queue (needs at least one document). */
create or replace function public.resubmit_verification(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_org_role(p_organization_id, array['owner']) then
    raise exception 'Only the owner can resubmit' using errcode = '42501';
  end if;
  if not exists (select 1 from public.business_documents d
                 where d.organization_id = p_organization_id and d.status <> 'rejected') then
    raise exception 'Upload a document first' using errcode = '22023';
  end if;
  update public.organizations
     set verification_status = 'pending'
   where id = p_organization_id and verification_status in ('changes_requested', 'rejected', 'unverified');
  if not found then
    raise exception 'Nothing to resubmit' using errcode = '22023';
  end if;
  perform private.write_audit('organization.verification_resubmitted', 'organizations', p_organization_id::text,
    p_organization_id, null, jsonb_build_object('verification_status', 'pending'), '{}'::jsonb);
end;
$$;

-- Admin view of a vendor's verification history (from the audit log).
create or replace function public.verification_history(p_organization_id uuid)
returns table (at timestamptz, action text, reason text, actor text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.occurred_at, a.action, a.metadata ->> 'reason',
         (select coalesce(p.full_name, p.email::text) from public.profiles p where p.id = a.actor_user_id)
  from public.audit_logs a
  where (public.has_platform_permission('verification.manage') or public.has_org_role(p_organization_id, array['owner']))
    and a.organization_id = p_organization_id
    and a.action like 'organization.verification_%'
  order by a.occurred_at desc
  limit 50;
$$;

-- ======================================================================================
-- V2: a venue listing gets its calendar automatically
-- ======================================================================================
-- Deferred to the end of the transaction, so a resource created in the same
-- save (or by the vendor right after inserting) is respected.
create or replace function private.ensure_venue_resource()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.services%rowtype;
begin
  select * into s from public.services where id = new.id;
  if not found or s.status <> 'published' then
    return null;
  end if;
  if exists (select 1 from public.bookable_resources r where r.service_id = s.id) then
    return null;
  end if;
  if not exists (
    select 1 from public.service_categories sc
    join public.business_categories bc on bc.id = sc.business_category_id
    where sc.id = s.service_category_id and bc.slug = 'venues'
  ) then
    return null;
  end if;
  insert into public.bookable_resources (organization_id, branch_id, kind, service_id, name,
                                         allocation_mode, setup_buffer_min, breakdown_buffer_min)
  values (s.organization_id, s.branch_id, 'venue_space', s.id, left(s.title, 120), 'exclusive', 120, 60);
  return null;
end;
$$;

create constraint trigger services_ensure_venue_resource
  after insert or update of status on public.services
  deferrable initially deferred
  for each row when (new.status = 'published')
  execute function private.ensure_venue_resource();

-- Existing published venue listings without a calendar.
insert into public.bookable_resources (organization_id, branch_id, kind, service_id, name, allocation_mode,
                                       setup_buffer_min, breakdown_buffer_min)
select s.organization_id, s.branch_id, 'venue_space', s.id, left(s.title, 120), 'exclusive', 120, 60
from public.services s
join public.service_categories sc on sc.id = s.service_category_id
join public.business_categories bc on bc.id = sc.business_category_id
where s.status = 'published' and bc.slug = 'venues'
  and not exists (select 1 from public.bookable_resources r where r.service_id = s.id);

-- ======================================================================================
-- V5 / V9: first response, nudges, response time
-- ======================================================================================
alter table public.enquiries
  add column nudged_24h_at  timestamptz,
  add column nudged_4h_at   timestamptz,
  add column follow_up_on   date,
  add column follow_up_note text check (char_length(follow_up_note) <= 300),
  add column follow_up_sent_on date;

/** When the vendor first answered: a quote, a message or a decline (null = not yet). */
create or replace function private.enquiry_first_response(p_enquiry_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select min(t) from (
    select min(q.created_at) as t from public.quotations q where q.enquiry_id = p_enquiry_id
    union all
    select min(m.created_at) from public.enquiry_messages m where m.enquiry_id = p_enquiry_id and m.sender_side = 'vendor'
    union all
    select min(a.occurred_at) from public.audit_logs a
    where a.entity_table = 'enquiries' and a.entity_id = p_enquiry_id::text
      and a.new_data ->> 'status' = 'declined' and a.old_data ->> 'status' is distinct from 'declined'
  ) x;
$$;

/** Median minutes to first response over the last 90 days (request-to-book enquiries). */
create or replace function private.vendor_response(p_organization_id uuid)
returns table (median_minutes int, answered int, total int)
language sql
stable
security definer
set search_path = ''
as $$
  with e as (
    select en.created_at, private.enquiry_first_response(en.id) as first_at
    from public.enquiries en
    where en.organization_id = p_organization_id and en.booking_mode = 'request'
      and en.created_at > now() - interval '90 days'
      and en.created_at < now() - interval '10 minutes'
  )
  select (percentile_cont(0.5) within group (order by extract(epoch from first_at - created_at) / 60)
            filter (where first_at is not null))::int,
         count(*) filter (where first_at is not null)::int,
         count(*)::int
  from e;
$$;

-- Public: "Usually replies within …" on a live listing (only with 3+ answered enquiries).
create or replace function public.listing_response_time(p_service_id uuid)
returns table (median_minutes int, answered int)
language sql
stable
security definer
set search_path = ''
as $$
  select r.median_minutes, r.answered
  from public.services s
  join public.organizations o on o.id = s.organization_id and o.status = 'active'
  cross join lateral private.vendor_response(s.organization_id) r
  where s.id = p_service_id and s.status = 'published' and r.answered >= 3;
$$;
grant execute on function public.listing_response_time(uuid) to anon, authenticated;

/** V9: the vendor's score card (members of the business only). */
create or replace function public.vendor_scorecard(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r       record;
  v_quoted int;
  v_won    int;
  v_rating numeric;
  v_reviews int;
  v_cancel int;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into r from private.vendor_response(p_organization_id);
  select count(distinct q.enquiry_id) into v_quoted
  from public.quotations q
  where q.organization_id = p_organization_id and q.created_at > now() - interval '90 days';
  select count(*) into v_won
  from public.booking_items b
  join public.enquiries e on e.id = b.enquiry_id
  where b.organization_id = p_organization_id and b.created_at > now() - interval '90 days'
    and exists (select 1 from public.quotations q where q.enquiry_id = e.id);
  select round(avg(rv.rating)::numeric, 1), count(*) into v_rating, v_reviews
  from public.reviews rv where rv.organization_id = p_organization_id and rv.status = 'published';
  select count(*) into v_cancel
  from public.booking_items b
  where b.organization_id = p_organization_id and b.cancelled_by_side = 'vendor'
    and b.cancelled_at > now() - interval '90 days';
  return jsonb_build_object(
    'response_median_minutes', r.median_minutes, 'answered', r.answered, 'enquiries', r.total,
    'quoted', v_quoted, 'won', v_won,
    'rating', v_rating, 'reviews', v_reviews,
    'vendor_cancellations', v_cancel);
end;
$$;

-- ======================================================================================
-- V8: leads
-- ======================================================================================
create or replace function public.set_enquiry_follow_up(p_enquiry_id uuid, p_on date, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_enquiry(p_enquiry_id) then
    raise exception 'Enquiry not found' using errcode = 'P0002';
  end if;
  if p_on is not null and p_on < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Choose today or a later date' using errcode = '22023';
  end if;
  update public.enquiries
     set follow_up_on = p_on, follow_up_note = nullif(btrim(coalesce(p_note, '')), ''), follow_up_sent_on = null
   where id = p_enquiry_id;
end;
$$;

create or replace function public.vendor_leads(p_organization_id uuid, p_active_only boolean default true)
returns table (
  id              uuid,
  listing_title   text,
  customer_name   text,
  event_date      date,
  guests          int,
  status          text,
  stage           text,
  hold_expires_at timestamptz,
  last_contact_at timestamptz,
  first_response_at timestamptz,
  follow_up_on    date,
  follow_up_note  text,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, s.title,
         coalesce(nullif(split_part(btrim(coalesce(p.display_name, p.full_name, '')), ' ', 1), ''), 'Customer'),
         e.event_date, e.guests, e.status::text,
         case
           when e.status::text in ('booked', 'accepted', 'reserved') then 'won'
           when e.status::text in ('declined', 'cancelled', 'expired') then 'lost'
           when e.status::text = 'quoted' then 'quoted'
           else 'new'
         end,
         e.hold_expires_at,
         greatest(e.created_at, (select max(m.created_at) from public.enquiry_messages m where m.enquiry_id = e.id),
                  (select max(q.created_at) from public.quotations q where q.enquiry_id = e.id)),
         private.enquiry_first_response(e.id),
         e.follow_up_on, e.follow_up_note, e.created_at
  from public.enquiries e
  join public.services s on s.id = e.service_id
  join public.profiles p on p.id = e.customer_id
  where e.organization_id = p_organization_id
    and private.can_manage_enquiry(e.id)
    and (not p_active_only or e.status::text in ('open', 'quoted', 'accepted', 'reserved')
         or e.follow_up_on is not null and e.status::text not in ('booked'))
  order by (e.follow_up_on is null), e.follow_up_on, e.created_at desc
  limit 300;
$$;

-- ======================================================================================
-- Scheduled nudges (every 15 minutes): hold expiring, follow-up day
-- ======================================================================================
create or replace function public.send_vendor_nudges()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e        record;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_holds  int := 0;
  v_follow int := 0;
  v_hours  int;
begin
  if not private.is_system_caller() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  for e in
    select en.id, en.organization_id, en.branch_id, en.event_date, en.hold_expires_at, en.nudged_24h_at, s.title
    from public.enquiries en join public.services s on s.id = en.service_id
    where en.status = 'open' and en.hold_expires_at > now()
      and private.enquiry_first_response(en.id) is null
      and ((en.hold_expires_at <= now() + interval '24 hours' and en.nudged_24h_at is null
            and en.hold_expires_at > now() + interval '4 hours')
           or (en.hold_expires_at <= now() + interval '4 hours' and en.nudged_4h_at is null))
  loop
    v_hours := case when e.hold_expires_at <= now() + interval '4 hours' then 4 else 24 end;
    if v_hours = 4 then
      update public.enquiries set nudged_4h_at = now(), nudged_24h_at = coalesce(nudged_24h_at, now()) where id = e.id;
    else
      update public.enquiries set nudged_24h_at = now() where id = e.id;
    end if;
    perform private.notify_vendor(e.organization_id, e.branch_id, 'bookings', 'enquiry.hold_expiring',
                                  jsonb_build_object('listing', e.title, 'date', e.event_date, 'count', v_hours),
                                  '/vendor/enquiries/' || e.id);
    v_holds := v_holds + 1;
  end loop;

  for e in
    select en.id, en.organization_id, en.branch_id, en.event_date, en.follow_up_note, s.title
    from public.enquiries en join public.services s on s.id = en.service_id
    where en.follow_up_on = v_today and en.follow_up_sent_on is distinct from v_today
      and en.status::text not in ('booked')
  loop
    update public.enquiries set follow_up_sent_on = v_today where id = e.id;
    perform private.notify_vendor(e.organization_id, e.branch_id, 'bookings', 'enquiry.follow_up',
                                  jsonb_build_object('listing', e.title, 'date', e.event_date,
                                                     'reason', coalesce(e.follow_up_note, '')),
                                  '/vendor/enquiries/' || e.id);
    v_follow := v_follow + 1;
  end loop;

  return jsonb_build_object('hold_nudges', v_holds, 'follow_ups', v_follow);
end;
$$;

revoke all on function public.send_vendor_nudges() from public, anon, authenticated;
grant execute on function public.send_vendor_nudges() to service_role;
revoke all on function public.vendor_scorecard(uuid), public.vendor_leads(uuid, boolean),
                       public.set_enquiry_follow_up(uuid, date, text), public.resubmit_verification(uuid),
                       public.verification_history(uuid) from public, anon;
grant execute on function public.vendor_scorecard(uuid), public.vendor_leads(uuid, boolean),
                          public.set_enquiry_follow_up(uuid, date, text), public.resubmit_verification(uuid),
                          public.verification_history(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('vendor-nudges', '*/15 * * * *', 'select public.send_vendor_nudges()');
  else
    raise notice 'pg_cron not available; schedule public.send_vendor_nudges() externally';
  end if;
end;
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.valid_package_lines(text[]) to authenticated, service_role;
