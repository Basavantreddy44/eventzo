-- Roadmap Phase B batch 3b — C9 event day sheet.
-- One list per event of every confirmed vendor: when they arrive, who to call
-- and their phone. Contacts appear only once the booking is confirmed. Event
-- members (owner, co-hosts, and viewers the family invited) can see it.
--   arrival  = earliest call time of the vendor's assigned staff, else the start
--              of the reserved setup window, else the booking start
--   contact  = the first assigned staff member (name, role, phone), else the
--              business (WhatsApp number, else contact phone)

create or replace function public.event_day_sheet(p_event_id uuid)
returns table (
  booking_item_id uuid,
  category_slug   text,
  category_name   text,
  category_i18n   jsonb,
  listing_title   text,
  vendor_name     text,
  event_date      date,
  starts_at       timestamptz,
  ends_at         timestamptz,
  arrival_at      timestamptz,
  contact_name    text,
  contact_role    text,
  contact_phone   text,
  vendor_phone    text,
  site_address    text,
  instructions    text
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
  select bi.id, bc.slug::text, bc.name, to_jsonb(bc.name_i18n),
         coalesce(s.title, bi.snapshot -> 'listing' ->> 'title'), o.name,
         bi.event_date, lower(bi.period), upper(bi.period),
         coalesce(st.call_time, lower(rr.blocked_period), lower(bi.period)),
         coalesce(st.full_name, o.name), st.role_label,
         coalesce(st.phone, bp.whatsapp_phone, bp.contact_phone),
         coalesce(bp.whatsapp_phone, bp.contact_phone),
         j.site_address, j.instructions
  from public.enquiries e
  join public.booking_items bi on bi.enquiry_id = e.id and bi.status = 'confirmed'
  join public.services s on s.id = bi.service_id
  join public.organizations o on o.id = bi.organization_id
  join public.service_categories sc on sc.id = s.service_category_id
  join public.business_categories bc on bc.id = sc.business_category_id
  left join public.business_profiles bp on bp.organization_id = bi.organization_id
  left join public.resource_reservations rr on rr.id = bi.reservation_id
  left join public.jobs j on j.booking_item_id = bi.id and j.status = 'active'
  left join lateral (
    select sp.full_name, sp.phone, ja.role_label, ja.call_time
    from public.job_assignments ja
    join public.staff_profiles sp on sp.id = ja.staff_profile_id
    where ja.job_id = j.id and ja.status not in ('declined', 'cancelled')
    order by ja.call_time nulls last, ja.created_at
    limit 1
  ) st on true
  where e.event_id = p_event_id
  order by bi.event_date, 10, bc.slug;
end;
$$;

revoke all on function public.event_day_sheet(uuid) from public, anon;
grant execute on function public.event_day_sheet(uuid) to authenticated;
