-- =============================================================================
-- 2200 · Roadmap C2: availability calendar on every listing
--   One month at a time: free / held / booked / unknown per day, for a normal
--   event (default 10:00–22:00, same check as the enquiry form), with
--   muhurtham dates and the listing's surcharge. "held" = only temporary
--   enquiry holds block the day; "booked" = a confirmed booking or a vendor
--   block. Nothing about who holds or booked is exposed.
-- =============================================================================

create or replace function public.listing_month(
  p_service_id uuid,
  p_month      date,                  -- any day in the month
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
  v_first     date := date_trunc('month', p_month)::date;
  v_last      date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
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
  with days as (
    select d::date as day,
           tstzrange((d::date + p_start) at time zone v_tz, (d::date + p_end) at time zone v_tz, '[)') as period
    from generate_series(v_first, v_last, interval '1 day') d
  ),
  res as (
    select r.id, r.setup_buffer_min, r.breakdown_buffer_min, r.travel_buffer_min
    from public.bookable_resources r where r.service_id = p_service_id and r.active
  )
  select days.day,
         case
           when not exists (select 1 from res) then 'unknown'
           when exists (select 1 from res where private.resource_free(res.id, days.period, 1)) then 'free'
           when exists (
             select 1 from res join public.resource_reservations rr on rr.resource_id = res.id
             where rr.status in ('confirmed', 'blocked')
               and rr.blocked_period && private.compute_blocked_period(days.period, res.setup_buffer_min,
                                                                       res.breakdown_buffer_min, res.travel_buffer_min)
           ) then 'booked'
           else 'held'
         end,
         exists (
           select 1 from public.auspicious_dates ad
           where ad.is_published and ad.date = days.day and (ad.city_id is null or ad.city_id = v_city)
         ),
         case when exists (
           select 1 from public.auspicious_dates ad
           where ad.is_published and ad.date = days.day and (ad.city_id is null or ad.city_id = v_city)
         ) then v_surcharge else 0 end
  from days
  order by days.day;
end;
$$;

revoke all on function public.listing_month(uuid, date, time, time) from public;
grant execute on function public.listing_month(uuid, date, time, time) to anon, authenticated;
