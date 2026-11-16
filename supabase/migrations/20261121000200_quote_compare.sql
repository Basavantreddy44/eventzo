-- =============================================================================
-- 2400 · Roadmap C3 + C5
--   C3  "Get 3 quotes": similar listings that are free for the same date and
--       hours, so one request can also go to up to 2 more vendors.
--   C5  Compare the quotes received for one category of an event, and accept
--       one; the others in that category are withdrawn with a polite note.
-- =============================================================================

-- ---------- C3: similar, available, request-to-book listings ----------------------
create or replace function public.similar_available_services(
  p_service_id uuid,
  p_event_date date,
  p_start      time,
  p_end        time,
  p_guests     int default null,
  p_limit      int default 2
)
returns table (id uuid, title text, slug text, vendor_name text, verified boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s    public.services%rowtype;
  v_tz text;
begin
  select sv.* into s from public.services sv where sv.id = p_service_id;
  if not found or p_end <= p_start then
    return;
  end if;
  select c.timezone into v_tz from public.cities c where c.id = s.city_id;
  v_tz := coalesce(v_tz, 'Asia/Kolkata');

  return query
  select x.id, x.title::text, x.slug::text, o.name::text, o.verification_status = 'verified'
  from public.services x
  join public.organizations o on o.id = x.organization_id
  where x.id <> s.id
    and x.organization_id <> s.organization_id
    and x.service_category_id = s.service_category_id
    and x.city_id = s.city_id
    and x.status = 'published' and o.status = 'active'
    and x.booking_mode = 'request'                      -- extra requests never auto-reserve
    and (auth.uid() is null or not public.is_org_member(x.organization_id))
    and (p_guests is null or ((x.max_guests is null or p_guests <= x.max_guests)
                              and (x.min_guests is null or p_guests >= x.min_guests)))
    and (
      not exists (select 1 from public.bookable_resources r where r.service_id = x.id and r.active)
      or exists (
        select 1 from public.bookable_resources r
        where r.service_id = x.id and r.active
          and private.resource_free(r.id, tstzrange((p_event_date + p_start) at time zone v_tz,
                                                    (p_event_date + p_end) at time zone v_tz, '[)'), 1))
    )
  order by (o.verification_status = 'verified') desc,
           abs(coalesce(x.base_price_paise, 0) - coalesce(s.base_price_paise, 0)),
           x.published_at desc nulls last
  limit least(greatest(coalesce(p_limit, 2), 0), 5);
end;
$$;
revoke all on function public.similar_available_services(uuid, date, time, time, int, int) from public;
grant execute on function public.similar_available_services(uuid, date, time, time, int, int) to authenticated;

-- ---------- C5: quotes to compare within an event ------------------------------------
create or replace function public.event_quote_options(p_event_id uuid)
returns table (
  enquiry_id          uuid,
  enquiry_status      text,
  quotation_id        uuid,
  quotation_status    text,
  listing_title       text,
  listing_slug        text,
  vendor_name         text,
  verified            boolean,
  category_slug       text,
  category_name       text,
  category_name_i18n  jsonb,
  currency            char(3),
  subtotal_paise      bigint,
  discount_paise      bigint,
  tax_paise           bigint,
  total_paise         bigint,
  advance_bps         int,
  cancellation_policy text,
  valid_until         timestamptz,
  notes               text,
  items               jsonb,
  is_owner            boolean
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
  select e.id, e.status::text, q.id, q.status::text,
         coalesce(s.title, e.price_snapshot ->> 'title')::text, s.slug::text, o.name::text,
         o.verification_status = 'verified',
         bc.slug::text, bc.name::text, bc.name_i18n,
         q.currency, q.subtotal_paise, q.discount_paise, q.tax_paise, q.total_paise,
         s.advance_bps, s.cancellation_policy::text, q.valid_until, q.notes,
         coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity,
                                                        'amount_paise', i.amount_paise) order by i.sort_order)
                   from public.quotation_items i where i.quotation_id = q.id), '[]'::jsonb),
         e.customer_id = auth.uid()
  from public.enquiries e
  join public.services s on s.id = e.service_id
  join public.organizations o on o.id = e.organization_id
  join public.service_categories sc on sc.id = s.service_category_id
  join public.business_categories bc on bc.id = sc.business_category_id
  join lateral (
    select * from public.quotations q2
    where q2.enquiry_id = e.id and q2.status in ('sent', 'accepted')
    order by q2.version desc limit 1
  ) q on true
  where e.event_id = p_event_id
  order by bc.display_order, bc.slug, q.total_paise;
end;
$$;
revoke all on function public.event_quote_options(uuid) from public, anon;
grant execute on function public.event_quote_options(uuid) to authenticated;

-- Accept one quote; withdraw the other open requests of the same category in
-- the same event, leaving each vendor a short note first.
create or replace function public.accept_event_quote(p_quotation_id uuid, p_note text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  e        public.enquiries%rowtype;
  v_cat    uuid;
  v_other  uuid;
  v_count  int := 0;
begin
  select en.* into e
  from public.quotations q join public.enquiries en on en.id = q.enquiry_id
  where q.id = p_quotation_id;
  if not found or e.customer_id is distinct from auth.uid() then
    raise exception 'Quotation not found' using errcode = 'P0002';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is null or char_length(p_note) > 500 then
    raise exception 'A short note for the other vendors is required' using errcode = '22023';
  end if;

  perform public.respond_quotation(p_quotation_id, true);

  if e.event_id is null then
    return 0;
  end if;
  select sc.business_category_id into v_cat
  from public.services s join public.service_categories sc on sc.id = s.service_category_id
  where s.id = e.service_id;

  for v_other in
    select en.id
    from public.enquiries en
    join public.services s on s.id = en.service_id
    join public.service_categories sc on sc.id = s.service_category_id
    where en.event_id = e.event_id and en.id <> e.id and en.customer_id = e.customer_id
      and sc.business_category_id = v_cat and en.status in ('open', 'quoted')
  loop
    perform public.post_enquiry_message(v_other, p_note);
    perform public.cancel_enquiry(v_other);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.accept_event_quote(uuid, text) from public, anon;
grant execute on function public.accept_event_quote(uuid, text) to authenticated;
