-- =============================================================================
-- 1900 · QA retest fixes (15 Nov 2026)
--   B11  A vendor is listed only after admin verification (product owner,
--        15 Nov 2026; replaces P2-1 "any active vendor is listed").
--        go-live = profile complete + a published listing + verified.
--        Losing verification takes the vendor out of search (draft) without
--        touching existing enquiries or bookings.
--   B12  The public date check tests the requested event hours (default
--        10:00–22:00), not the whole calendar day, so the day after a booking
--        no longer collides with that booking's breakdown buffer.
-- =============================================================================

-- ---------- B11: verification gates go-live ---------------------------------------
create or replace function private.try_activate_organization(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organizations o
     set status = 'active'
   where o.id = p_organization_id
     and o.status = 'draft'                    -- never re-activates suspended / closed vendors
     and o.verification_status = 'verified'    -- B11: admin approves before publishing
     and exists (
       select 1 from public.business_profiles bp
       where bp.organization_id = o.id
         and nullif(trim(bp.description), '') is not null
         and bp.contact_phone is not null)
     and exists (
       select 1 from public.services s
       where s.organization_id = o.id and s.status = 'published');

  if found then
    perform private.write_audit('organization.activated', 'organizations', p_organization_id::text, p_organization_id,
      null, jsonb_build_object('status', 'active'),
      jsonb_build_object('rule', 'verified_profile_complete_and_published_listing'));
  end if;
end;
$$;

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
  v_org public.organizations%rowtype;
begin
  if not public.has_platform_permission('verification.manage') then
    raise exception 'Not allowed to change verification' using errcode = '42501';
  end if;
  if p_status not in ('verified', 'rejected', 'pending') then
    raise exception 'Unsupported verification status' using errcode = '22023';
  end if;
  if p_status = 'rejected' and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required when rejecting verification' using errcode = '22023';
  end if;
  if p_status = 'verified' and not exists (
    select 1 from public.business_documents d where d.organization_id = p_organization_id and d.status = 'approved'
  ) then
    raise exception 'Approve at least one document before verifying' using errcode = '23514';
  end if;

  update public.organizations
     set verification_status = p_status,
         verified_at = case when p_status = 'verified' then now() end
   where id = p_organization_id
  returning * into v_org;

  if not found then
    raise exception 'Organisation not found' using errcode = 'P0002';
  end if;

  perform private.write_audit('organization.verification_' || p_status::text, 'organizations', p_organization_id::text,
    p_organization_id, null, jsonb_build_object('verification_status', p_status),
    jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), '')));

  if p_status = 'verified' then
    -- A complete vendor goes live the moment it is verified.
    perform private.try_activate_organization(p_organization_id);
  elsif v_org.status = 'active' then
    -- Verification withdrawn: out of search until verified again (bookings stay).
    update public.organizations set status = 'draft' where id = p_organization_id;
    perform private.write_audit('organization.deactivated', 'organizations', p_organization_id::text,
      p_organization_id, jsonb_build_object('status', 'active'), jsonb_build_object('status', 'draft'),
      jsonb_build_object('rule', 'verification_' || p_status::text));
  end if;

  select * into v_org from public.organizations where id = p_organization_id;
  return v_org;
end;
$$;

-- Existing vendors that went live under the old rule without verification.
with demoted as (
  update public.organizations
     set status = 'draft'
   where status = 'active' and verification_status <> 'verified'
  returning id
)
select private.write_audit('organization.deactivated', 'organizations', id::text, id,
         jsonb_build_object('status', 'active'), jsonb_build_object('status', 'draft'),
         jsonb_build_object('rule', 'verification_required_from_2026_11_15'))
from demoted;

-- ---------- B12: date check uses the event hours ------------------------------------
drop function if exists public.listing_availability(uuid, date, date);

create or replace function public.listing_availability(
  p_service_id uuid,
  p_from       date,
  p_to         date,
  p_start      time default '10:00',
  p_end        time default '22:00'
)
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
  if p_end <= p_start then
    raise exception 'The end time must be after the start time' using errcode = '22023';
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
               -- Same period an enquiry for these hours would reserve (buffers are added by resource_free).
               and private.resource_free(r.id, tstzrange((d::date + p_start) at time zone v_tz,
                                                         (d::date + p_end) at time zone v_tz, '[)'), 1)
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

revoke all on function public.listing_availability(uuid, date, date, time, time) from public;
grant execute on function public.listing_availability(uuid, date, date, time, time) to anon, authenticated;
