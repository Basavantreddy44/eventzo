-- =============================================================================
-- 0800 · RLS helper functions
-- All are SECURITY DEFINER with an empty search_path, so they can read the
-- membership/role tables without recursing through those tables' own RLS.
-- They only ever answer questions about the *calling* user (auth.uid()).
-- =============================================================================

create or replace function public.has_platform_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_role_assignments ura
    join public.role_permissions rp on rp.role_id = ura.role_id
    join public.permissions p       on p.id = rp.permission_id
    where ura.user_id = (select auth.uid())
      and p.code = p_permission
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_platform_permission('admin.access');
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role::text = any (p_roles)
  );
$$;

-- Owners can access every branch of their organisation; branch managers and
-- staff only the branches granted through member_branch_access.
create or replace function public.can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.branches b
    join public.organization_members m
      on m.organization_id = b.organization_id
     and m.user_id = (select auth.uid())
     and m.status = 'active'
    where b.id = p_branch_id
      and (
        m.role = 'owner'
        or exists (
          select 1 from public.member_branch_access mba
          where mba.member_id = m.id and mba.branch_id = b.id
        )
      )
  );
$$;

-- Can the caller see this resource (and therefore its reservations)?
create or replace function private.can_view_resource(p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookable_resources r
    where r.id = p_resource_id
      and case
            when r.branch_id is null then public.is_org_member(r.organization_id)
            else public.can_access_branch(r.branch_id)
          end
  );
$$;

-- Can the caller create/change reservations and settings for this resource?
create or replace function private.can_manage_resource(p_organization_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_org_role(p_organization_id, array['owner'])
      or (
        p_branch_id is not null
        and public.has_org_role(p_organization_id, array['branch_manager'])
        and public.can_access_branch(p_branch_id)
      );
$$;

create or replace function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Execution rights. has_platform_permission / is_platform_admin are also
-- granted to anon because public-read policies (taxonomy, policy_versions)
-- reference them; for anon they simply return false (auth.uid() is null).
revoke all on function public.has_platform_permission(text)      from public;
revoke all on function public.is_platform_admin()                from public;
grant execute on function public.has_platform_permission(text)   to anon;
grant execute on function public.is_platform_admin()             to anon;
revoke all on function public.is_org_member(uuid)                from public, anon;
revoke all on function public.has_org_role(uuid, text[])         from public, anon;
revoke all on function public.can_access_branch(uuid)            from public, anon;
grant execute on function public.has_platform_permission(text)   to authenticated, service_role;
grant execute on function public.is_platform_admin()             to authenticated, service_role;
grant execute on function public.is_org_member(uuid)             to authenticated, service_role;
grant execute on function public.has_org_role(uuid, text[])      to authenticated, service_role;
grant execute on function public.can_access_branch(uuid)         to authenticated, service_role;

grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
grant execute on function private.can_view_resource(uuid)          to authenticated, service_role;
grant execute on function private.can_manage_resource(uuid, uuid)  to authenticated, service_role;
grant execute on function private.try_uuid(text)                   to authenticated, service_role;
