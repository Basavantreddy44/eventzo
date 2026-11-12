-- =============================================================================
-- Phase 8 · Admin & platform operations
--   vendors   – suspend / close / reinstate with a reason (bookings continue)
--   users     – list, support view (read-only, audited), block sign-in
--   roles     – the last super admin can't be removed
--   reports   – admin vendor overview; payments ledger uses existing finance RLS
-- Decisions (product owner, 12 Nov 2026): suspension keeps existing bookings;
-- blocking sign-in needs a reason and is audited; support gets a read-only,
-- audited view (no "log in as"); a platform payments ledger for finance.
-- =============================================================================

insert into public.permissions (code, description) values
  ('users.block', 'Block or unblock a user''s sign-in')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where p.code = 'users.block' and r.code in ('super_admin', 'support_agent')
on conflict do nothing;

-- ---------- vendor status ---------------------------------------------------------------
alter table public.organizations
  add column status_reason     text check (char_length(status_reason) <= 1000),
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references public.profiles (id) on delete set null;

-- Suspend (hidden from search, no new enquiries; existing bookings continue),
-- close (same, permanent unless reinstated) or reinstate (back to active when
-- the go-live rules are still met, otherwise draft).
create or replace function public.set_organization_status(
  p_organization_id uuid,
  p_action          text,
  p_reason          text default null
)
returns public.organization_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  o        public.organizations%rowtype;
  v_reason text := nullif(trim(p_reason), '');
  v_kind   text;
begin
  if not public.has_platform_permission('organizations.manage') then
    raise exception 'Only platform admins can change a vendor''s status' using errcode = '42501';
  end if;
  select * into o from public.organizations where id = p_organization_id for update;
  if not found then
    raise exception 'Vendor not found' using errcode = 'P0002';
  end if;
  if p_action in ('suspend', 'close') and (v_reason is null or char_length(v_reason) < 5) then
    raise exception 'Give a reason (at least 5 characters)' using errcode = '22023';
  end if;

  case p_action
    when 'suspend' then
      if o.status = 'suspended' then return o.status; end if;
      if o.status = 'closed' then
        raise exception 'A closed vendor must be reinstated first' using errcode = '22023';
      end if;
      update public.organizations
         set status = 'suspended', status_reason = v_reason, status_changed_at = now(), status_changed_by = auth.uid()
       where id = o.id;
      v_kind := 'vendor.suspended';
    when 'close' then
      if o.status = 'closed' then return o.status; end if;
      update public.organizations
         set status = 'closed', status_reason = v_reason, status_changed_at = now(), status_changed_by = auth.uid()
       where id = o.id;
      v_kind := 'vendor.closed';
    when 'reinstate' then
      if o.status not in ('suspended', 'closed') then return o.status; end if;
      update public.organizations
         set status = 'draft', status_reason = v_reason, status_changed_at = now(), status_changed_by = auth.uid()
       where id = o.id;
      perform private.try_activate_organization(o.id);
      v_kind := 'vendor.reinstated';
    else
      raise exception 'Unknown action' using errcode = '22023';
  end case;

  perform private.notify_vendor(o.id, null, 'account', v_kind,
    jsonb_build_object('vendor', o.name, 'reason', coalesce(v_reason, '')), '/vendor');
  return (select status from public.organizations where id = o.id);
end;
$$;

-- ---------- user blocking -----------------------------------------------------------------
alter table public.profiles
  add column blocked_at     timestamptz,
  add column blocked_reason text check (char_length(blocked_reason) <= 500),
  add column blocked_by     uuid references public.profiles (id) on delete set null;

-- Records the block and ends the person's sessions. The server action then
-- bans the account in Supabase Auth (service role), so they can't sign in again.
create or replace function public.set_user_block(p_user_id uuid, p_block boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(trim(p_reason), '');
  v_target_admin boolean;
begin
  if not public.has_platform_permission('users.block') then
    raise exception 'You cannot block users' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot block yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  select exists (
    select 1 from public.user_role_assignments ura
    join public.role_permissions rp on rp.role_id = ura.role_id
    join public.permissions p on p.id = rp.permission_id
    where ura.user_id = p_user_id and p.code = 'admin.access') into v_target_admin;
  if v_target_admin and not public.has_platform_permission('roles.manage') then
    raise exception 'Only a super admin can block platform staff' using errcode = '42501';
  end if;
  if p_block and (v_reason is null or char_length(v_reason) < 5) then
    raise exception 'Give a reason (at least 5 characters)' using errcode = '22023';
  end if;

  if p_block then
    update public.profiles set blocked_at = now(), blocked_reason = v_reason, blocked_by = auth.uid()
     where id = p_user_id;
    delete from auth.sessions where user_id = p_user_id;   -- revokes their refresh tokens
  else
    update public.profiles set blocked_at = null, blocked_reason = null, blocked_by = null where id = p_user_id;
  end if;

  insert into public.audit_logs (actor_user_id, action, entity_table, entity_id, metadata)
  values (auth.uid(), case when p_block then 'user.blocked' else 'user.unblocked' end, 'profiles', p_user_id::text,
          jsonb_build_object('reason', v_reason));
end;
$$;

-- A blocked person's app session is treated as signed out (my_access returns nothing).
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
  where (select auth.uid()) is not null
    and not exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.blocked_at is not null);
$$;

-- ---------- roles: never lose the last super admin ------------------------------------------
create or replace function private.protect_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.roles where id = old.role_id and code = 'super_admin')
     and not exists (select 1 from public.user_role_assignments ura
                     join public.roles r on r.id = ura.role_id
                     where r.code = 'super_admin' and ura.id <> old.id) then
    raise exception 'The last super admin cannot be removed' using errcode = '23514';
  end if;
  return old;
end;
$$;

create trigger user_role_assignments_last_super_admin before delete on public.user_role_assignments
  for each row execute function private.protect_last_super_admin();

-- ---------- admin lists & support view ------------------------------------------------------
create or replace function public.admin_list_users(
  p_search text default null,
  p_limit  int default 50,
  p_offset int default 0
)
returns table (
  id              uuid,
  email           text,
  full_name       text,
  phone           text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  roles           text[],
  vendor_count    int,
  blocked_at      timestamptz,
  total_count     bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(trim(p_search), '');
begin
  if not public.has_platform_permission('users.read') then
    raise exception 'You cannot list users' using errcode = '42501';
  end if;
  return query
  select p.id, p.email::text, coalesce(p.full_name, p.display_name), p.phone, p.created_at, u.last_sign_in_at,
         coalesce((select array_agg(r.code::text order by r.code) from public.user_role_assignments ura
                   join public.roles r on r.id = ura.role_id where ura.user_id = p.id), '{}'),
         (select count(*)::int from public.organization_members m where m.user_id = p.id and m.status = 'active'),
         p.blocked_at,
         count(*) over ()
  from public.profiles p
  left join auth.users u on u.id = p.id
  where v_q is null
     or p.email::text ilike '%' || v_q || '%'
     or coalesce(p.full_name, '') ilike '%' || v_q || '%'
     or coalesce(p.phone, '') like '%' || regexp_replace(v_q, '[^0-9+]', '', 'g') || '%' and regexp_replace(v_q, '[^0-9]', '', 'g') <> ''
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

-- Read-only support view of one person. Every call is written to the audit log.
create or replace function public.admin_user_overview(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.profiles%rowtype;
  v_out jsonb;
  v_money boolean := public.has_platform_permission('finance.read') or public.has_platform_permission('support.manage');
begin
  if not public.has_platform_permission('users.read') then
    raise exception 'You cannot view users' using errcode = '42501';
  end if;
  select * into p from public.profiles where id = p_user_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_user_id, action, entity_table, entity_id)
  values (auth.uid(), 'support.user_viewed', 'profiles', p_user_id::text);

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id, 'email', p.email, 'full_name', p.full_name, 'display_name', p.display_name, 'phone', p.phone,
      'preferred_locale', p.preferred_locale, 'created_at', p.created_at,
      'blocked_at', p.blocked_at, 'blocked_reason', p.blocked_reason,
      'last_sign_in_at', (select u.last_sign_in_at from auth.users u where u.id = p.id),
      'email_confirmed_at', (select u.email_confirmed_at from auth.users u where u.id = p.id)),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('code', r.code, 'granted_at', ura.created_at) order by r.code)
                       from public.user_role_assignments ura join public.roles r on r.id = ura.role_id
                       where ura.user_id = p.id), '[]'::jsonb),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object(
                         'organization_id', o.id, 'organization_name', o.name, 'organization_status', o.status,
                         'role', m.role, 'status', m.status) order by o.name)
                       from public.organization_members m join public.organizations o on o.id = m.organization_id
                       where m.user_id = p.id), '[]'::jsonb),
    'enquiries', coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
                       select jsonb_build_object('id', e.id, 'listing', s.title, 'vendor', o.name, 'event_date', e.event_date,
                                                 'status', e.status, 'created_at', e.created_at) as x
                       from public.enquiries e
                       join public.services s on s.id = e.service_id
                       join public.organizations o on o.id = e.organization_id
                       where e.customer_id = p.id order by e.created_at desc limit 50) t), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(x order by x ->> 'event_date' desc) from (
                       select jsonb_build_object('id', b.id, 'listing', b.snapshot #>> '{listing,title}', 'vendor', o.name,
                                                 'event_date', b.event_date, 'status', b.status,
                                                 'total_paise', case when v_money then b.total_paise end,
                                                 'paid_paise', case when v_money then b.paid_paise end) as x
                       from public.booking_items b join public.organizations o on o.id = b.organization_id
                       where b.customer_id = p.id order by b.event_date desc limit 50) t), '[]'::jsonb),
    'payments', case when v_money then coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
                       select jsonb_build_object('id', pm.id, 'vendor', o.name, 'kind', pm.kind, 'method', pm.method,
                                                 'status', pm.status, 'amount_paise', pm.amount_paise,
                                                 'receipt_number', pm.receipt_number, 'paid_at', pm.paid_at,
                                                 'created_at', pm.created_at) as x
                       from public.payments pm join public.organizations o on o.id = pm.organization_id
                       where pm.customer_id = p.id order by pm.created_at desc limit 50) t), '[]'::jsonb) end,
    'events', (select count(*) from public.event_members em where em.user_id = p.id),
    'activity', case when public.has_platform_permission('audit.read') then coalesce((
                       select jsonb_agg(jsonb_build_object('id', a.id, 'occurred_at', a.occurred_at, 'action', a.action,
                                                           'entity_table', a.entity_table) order by a.id desc)
                       from (select * from public.audit_logs where actor_user_id = p.id order by id desc limit 30) a), '[]'::jsonb) end
  ) into v_out;
  return v_out;
end;
$$;

create or replace function public.admin_list_vendors(
  p_search text default null,
  p_status public.organization_status default null,
  p_limit  int default 50,
  p_offset int default 0
)
returns table (
  id                  uuid,
  name                text,
  slug                text,
  status              public.organization_status,
  verification_status public.verification_status,
  city                text,
  category            text,
  owner_email         text,
  listings            int,
  bookings            int,
  created_at          timestamptz,
  total_count         bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(trim(p_search), '');
begin
  if not public.has_platform_permission('organizations.read') then
    raise exception 'You cannot list vendors' using errcode = '42501';
  end if;
  return query
  select o.id, o.name, o.slug::text, o.status, o.verification_status, c.name, bc.name,
         (select pr.email::text from public.organization_members m join public.profiles pr on pr.id = m.user_id
          where m.organization_id = o.id and m.role = 'owner' and m.status = 'active' order by m.created_at limit 1),
         (select count(*)::int from public.services s where s.organization_id = o.id and s.status = 'published'),
         (select count(*)::int from public.booking_items b where b.organization_id = o.id and b.status = 'confirmed'),
         o.created_at,
         count(*) over ()
  from public.organizations o
  left join public.cities c on c.id = o.primary_city_id
  left join public.business_categories bc on bc.id = o.primary_business_category_id
  where (p_status is null or o.status = p_status)
    and (v_q is null or o.name ilike '%' || v_q || '%' or o.slug::text ilike '%' || v_q || '%'
         or coalesce(o.legal_name, '') ilike '%' || v_q || '%')
  order by o.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_vendor_overview(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_money boolean := public.has_platform_permission('finance.read');
begin
  if not public.has_platform_permission('organizations.read') then
    raise exception 'You cannot view vendors' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'Vendor not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'listings', (select jsonb_build_object(
        'published', count(*) filter (where status = 'published'),
        'paused', count(*) filter (where status = 'paused'),
        'draft', count(*) filter (where status = 'draft'))
      from public.services where organization_id = p_organization_id),
    'enquiries_90d', (select count(*) from public.enquiries where organization_id = p_organization_id
                       and created_at > now() - interval '90 days'),
    'bookings', (select jsonb_build_object(
        'confirmed_upcoming', count(*) filter (where status = 'confirmed' and event_date >= current_date),
        'confirmed_total', count(*) filter (where status = 'confirmed'),
        'cancelled_by_vendor', count(*) filter (where status = 'cancelled' and cancelled_by_side = 'vendor'),
        'cancelled_total', count(*) filter (where status = 'cancelled'))
      from public.booking_items where organization_id = p_organization_id),
    'money', case when v_money then (select jsonb_build_object(
        'received_paise', coalesce(sum(amount_paise) filter (where status = 'paid'), 0),
        'online_paise', coalesce(sum(amount_paise) filter (where status = 'paid' and method = 'razorpay'), 0),
        'offline_paise', coalesce(sum(amount_paise) filter (where status = 'paid' and method = 'offline'), 0))
      from public.payments where organization_id = p_organization_id) end,
    'refunds_pending', case when v_money then (select count(*) from public.refunds
        where organization_id = p_organization_id and status in ('pending', 'processing', 'failed')) end,
    'members', (select count(*) from public.organization_members where organization_id = p_organization_id and status = 'active')
  );
end;
$$;

-- ---------- grants -----------------------------------------------------------------------------
revoke all on function public.set_organization_status(uuid, text, text) from public, anon;
revoke all on function public.set_user_block(uuid, boolean, text) from public, anon;
revoke all on function public.admin_list_users(text, int, int) from public, anon;
revoke all on function public.admin_user_overview(uuid) from public, anon;
revoke all on function public.admin_list_vendors(text, public.organization_status, int, int) from public, anon;
revoke all on function public.admin_vendor_overview(uuid) from public, anon;
grant execute on function public.set_organization_status(uuid, text, text) to authenticated;
grant execute on function public.set_user_block(uuid, boolean, text) to authenticated;
grant execute on function public.admin_list_users(text, int, int) to authenticated;
grant execute on function public.admin_user_overview(uuid) to authenticated;
grant execute on function public.admin_list_vendors(text, public.organization_status, int, int) to authenticated;
grant execute on function public.admin_vendor_overview(uuid) to authenticated;

revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

revoke all on all functions in schema private from public, anon;
