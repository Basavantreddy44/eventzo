-- =============================================================================
-- 1000 · RPC functions (called from Server Actions via supabase.rpc)
--   my_access()              – caller's roles, permissions, memberships
--   create_organization()    – vendor onboarding (caller becomes owner)
--   reserve_resource()       – the single write path for reservations
--   release_reservation()    – release / cancel a reservation
--   release_expired_holds()  – pg_cron job (service role only)
-- =============================================================================

-- ---------- my_access --------------------------------------------------------
create or replace function public.my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', (select auth.uid()),
    'roles', coalesce((
      select jsonb_agg(r.code order by r.code)
      from public.user_role_assignments ura
      join public.roles r on r.id = ura.role_id
      where ura.user_id = (select auth.uid())
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(distinct p.code)
      from public.user_role_assignments ura
      join public.role_permissions rp on rp.role_id = ura.role_id
      join public.permissions p on p.id = rp.permission_id
      where ura.user_id = (select auth.uid())
    ), '[]'::jsonb),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
               'organization_id', o.id,
               'organization_name', o.name,
               'organization_slug', o.slug,
               'organization_status', o.status,
               'verification_status', o.verification_status,
               'role', m.role
             ) order by o.created_at)
      from public.organization_members m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = (select auth.uid()) and m.status = 'active'
    ), '[]'::jsonb)
  )
  where (select auth.uid()) is not null;
$$;

revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- ---------- system caller ------------------------------------------------------
-- True for the service role and for direct superuser sessions (pg_cron,
-- migrations). NOTE: inside SECURITY DEFINER code current_user is the owner,
-- so we look at the session's SET ROLE value instead.
create or replace function private.is_system_caller()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or coalesce(current_setting('role', true), 'none') = 'service_role'
      or (coalesce(current_setting('role', true), 'none') = 'none'
          and session_user::text in ('postgres', 'supabase_admin'));
$$;

-- ---------- slug helper -------------------------------------------------------
create or replace function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(left(trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')), 60), ''),
    'vendor'
  );
$$;

-- ---------- create_organization ----------------------------------------------
create or replace function public.create_organization(
  p_name                 text,
  p_business_category_id uuid,
  p_city_id              uuid,
  p_idempotency_key      text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text := trim(coalesce(p_name, ''));
  v_org_id uuid;
  v_slug   text;
  v_base   text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if char_length(v_name) not between 2 and 120 then
    raise exception 'Business name must be between 2 and 120 characters' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;

  -- Idempotent replay: same user + same key returns the same organisation.
  select o.id into v_org_id
  from public.organizations o
  where o.created_by = v_uid and o.idempotency_key = p_idempotency_key;
  if found then
    return v_org_id;
  end if;

  if not exists (select 1 from public.business_categories where id = p_business_category_id and active) then
    raise exception 'Unknown business category' using errcode = '22023';
  end if;
  if not exists (select 1 from public.cities where id = p_city_id and active) then
    raise exception 'Unknown city' using errcode = '22023';
  end if;

  -- Abuse guard: a person may own a small number of organisations.
  if (select count(*) from public.organizations o where o.created_by = v_uid) >= 5 then
    raise exception 'Organisation limit reached for this account' using errcode = '54000';
  end if;

  v_base := private.slugify(v_name);
  v_slug := v_base;
  while exists (select 1 from public.organizations where slug = v_slug::extensions.citext) loop
    v_slug := left(v_base, 53) || '-' || substr(md5(extensions.gen_random_uuid()::text), 1, 6);
  end loop;

  insert into public.organizations (name, slug, primary_business_category_id, primary_city_id, status, created_by, idempotency_key)
  values (v_name, v_slug, p_business_category_id, p_city_id, 'draft', v_uid, p_idempotency_key)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (v_org_id, v_uid, 'owner', 'active');

  insert into public.business_profiles (organization_id, display_name)
  values (v_org_id, v_name);

  insert into public.branches (organization_id, name, city_id, is_primary)
  values (v_org_id, v_name, p_city_id, true);

  perform private.write_audit('organization.created', 'organizations', v_org_id::text, v_org_id, null,
    jsonb_build_object('name', v_name, 'slug', v_slug), jsonb_build_object('via', 'create_organization'));

  return v_org_id;
end;
$$;

revoke all on function public.create_organization(text, uuid, uuid, text) from public, anon;
grant execute on function public.create_organization(text, uuid, uuid, text) to authenticated;

-- ---------- reserve_resource -------------------------------------------------
-- The single write path for reservations.
--  * exclusive resources → the GiST exclusion constraint rejects overlaps
--  * capacity resources  → row lock on the resource + sum of overlapping qty
--  * expired holds on the resource are released first, so they never block
--  * idempotent per (organization_id, idempotency_key)
-- Conflicts raise SQLSTATE 23P01 (exclusion_violation) in both modes.
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
  v_existing  public.resource_reservations%rowtype;
  v_result    public.resource_reservations%rowtype;
  v_period    tstzrange;
  v_blocked   tstzrange;
  v_used      bigint;
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

  -- Lock the resource row: serialises every reservation attempt on it.
  select * into r from public.bookable_resources where id = p_resource_id for update;
  if not found then
    raise exception 'Resource not found' using errcode = 'P0002';
  end if;

  -- Platform-sourced holds for customers arrive with bookings (Phase 4/5);
  -- until then only the vendor's owner / branch manager (or the system) may write.
  if not v_is_system and not private.can_manage_resource(r.organization_id, r.branch_id) then
    raise exception 'You cannot manage this resource' using errcode = '42501';
  end if;
  if not r.active then
    raise exception 'Resource is inactive' using errcode = '23514';
  end if;
  if r.allocation_mode = 'exclusive' and p_quantity <> 1 then
    raise exception 'Exclusive resources are reserved one at a time' using errcode = '22023';
  end if;

  -- Idempotent replay
  if p_idempotency_key is not null then
    select * into v_existing from public.resource_reservations
    where organization_id = r.organization_id and idempotency_key = p_idempotency_key;
    if found then
      if v_existing.resource_id <> p_resource_id or v_existing.period <> tstzrange(p_starts_at, p_ends_at, '[)') then
        raise exception 'Idempotency key was already used for a different reservation' using errcode = '22023';
      end if;
      return v_existing;
    end if;
  end if;

  -- Expired holds never block anyone.
  update public.resource_reservations
     set status = 'released'
   where resource_id = p_resource_id and status = 'hold' and hold_expires_at < now();

  v_period  := tstzrange(p_starts_at, p_ends_at, '[)');
  v_blocked := private.compute_blocked_period(v_period, r.setup_buffer_min, r.breakdown_buffer_min, r.travel_buffer_min);

  if r.allocation_mode = 'capacity' then
    -- Conservative: sums every reservation overlapping the window, so the
    -- result never over-allocates even when overlaps don't coincide.
    select coalesce(sum(quantity), 0) into v_used
    from public.resource_reservations
    where resource_id = p_resource_id
      and status in ('hold', 'confirmed', 'blocked')
      and not (status = 'hold' and hold_expires_at < now())
      and blocked_period && v_blocked;

    if v_used + p_quantity > r.capacity then
      raise exception 'Not enough capacity: % of % already reserved', v_used, r.capacity
        using errcode = '23P01';
    end if;
  end if;

  insert into public.resource_reservations (
    resource_id, organization_id, period, status, hold_expires_at, quantity,
    source, notes, created_by, idempotency_key
  ) values (
    p_resource_id, r.organization_id, v_period, p_status,
    case when p_status = 'hold' then now() + make_interval(mins => p_hold_minutes) end,
    p_quantity, p_source, nullif(trim(p_notes), ''), v_uid, p_idempotency_key
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.reserve_resource(uuid, timestamptz, timestamptz, public.reservation_source, public.reservation_status, int, int, text, text) from public, anon;
grant execute on function public.reserve_resource(uuid, timestamptz, timestamptz, public.reservation_source, public.reservation_status, int, int, text, text) to authenticated, service_role;

-- ---------- release_reservation ----------------------------------------------
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
    return v_res;  -- already final; idempotent
  end if;
  -- Platform bookings are cancelled through the booking flow (Phase 5), so a
  -- vendor's decision never silently cascades into a customer booking here.
  if v_res.booking_item_id is not null then
    raise exception 'This reservation belongs to a booking; cancel the booking item instead' using errcode = '42501';
  end if;

  update public.resource_reservations
     set status = case when p_cancel then 'cancelled'::public.reservation_status else 'released'::public.reservation_status end,
         notes  = coalesce(nullif(trim(p_reason), ''), notes)
   where id = p_reservation_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.release_reservation(uuid, boolean, text) from public, anon;
grant execute on function public.release_reservation(uuid, boolean, text) to authenticated;

-- ---------- release_expired_holds (scheduled) --------------------------------
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
  return v_count;
end;
$$;

revoke all on function public.release_expired_holds() from public, anon, authenticated;
grant execute on function public.release_expired_holds() to service_role;

-- pg_cron: release expired holds every minute (skipped where pg_cron is absent).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('release-expired-holds', '* * * * *', 'select public.release_expired_holds()');
  else
    raise notice 'pg_cron not available; schedule public.release_expired_holds() externally';
  end if;
end;
$$;

-- Functions created after migration 0800 default to EXECUTE for PUBLIC; tighten.
revoke all on all functions in schema private from public, anon;
