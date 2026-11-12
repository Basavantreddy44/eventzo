-- =============================================================================
-- 0900 · Row Level Security: enable on EVERY table + explicit grants/policies
--
-- Pattern for every table:
--   1. enable RLS
--   2. revoke the blanket Supabase default grants from anon/authenticated
--   3. grant only the verbs (and for UPDATE, only the columns) clients need
--   4. write one explicit policy per verb
-- Writes that need multi-row invariants go through SECURITY DEFINER RPCs.
-- =============================================================================

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on table public.%I from anon, authenticated', t.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name, display_name, phone, avatar_path, preferred_locale, timezone) on public.profiles to authenticated;

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.has_platform_permission('users.read'));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Changing the phone number invalidates its verification.
create or replace function private.reset_phone_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is distinct from old.phone then
    new.phone_verified_at := null;
  end if;
  return new;
end;
$$;

create trigger profiles_reset_phone_verification
  before update of phone on public.profiles
  for each row execute function private.reset_phone_verification();

-- ---------------------------------------------------------------------------
-- roles, permissions, role_permissions (read-only reference for signed-in users)
-- ---------------------------------------------------------------------------
grant select on public.roles, public.permissions, public.role_permissions to authenticated;

create policy roles_select on public.roles for select to authenticated using (true);
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- user_role_assignments
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.user_role_assignments to authenticated;

create policy ura_select_own_or_admin on public.user_role_assignments
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_platform_permission('users.read'));

create policy ura_insert_roles_manager on public.user_role_assignments
  for insert to authenticated
  with check (public.has_platform_permission('roles.manage') and granted_by = (select auth.uid()));

create policy ura_delete_roles_manager on public.user_role_assignments
  for delete to authenticated
  using (public.has_platform_permission('roles.manage'));

-- ---------------------------------------------------------------------------
-- taxonomy: public read of active rows, managed by taxonomy.manage
-- ---------------------------------------------------------------------------
grant select on public.business_categories, public.service_categories, public.cities, public.areas
  to anon, authenticated;
grant insert, update, delete on public.business_categories, public.service_categories, public.cities, public.areas
  to authenticated;

create policy business_categories_select on public.business_categories for select to anon, authenticated
  using (active or public.has_platform_permission('taxonomy.manage'));
create policy business_categories_insert on public.business_categories for insert to authenticated
  with check (public.has_platform_permission('taxonomy.manage'));
create policy business_categories_update on public.business_categories for update to authenticated
  using (public.has_platform_permission('taxonomy.manage')) with check (public.has_platform_permission('taxonomy.manage'));
create policy business_categories_delete on public.business_categories for delete to authenticated
  using (public.has_platform_permission('taxonomy.manage'));

create policy service_categories_select on public.service_categories for select to anon, authenticated
  using (active or public.has_platform_permission('taxonomy.manage'));
create policy service_categories_insert on public.service_categories for insert to authenticated
  with check (public.has_platform_permission('taxonomy.manage'));
create policy service_categories_update on public.service_categories for update to authenticated
  using (public.has_platform_permission('taxonomy.manage')) with check (public.has_platform_permission('taxonomy.manage'));
create policy service_categories_delete on public.service_categories for delete to authenticated
  using (public.has_platform_permission('taxonomy.manage'));

create policy cities_select on public.cities for select to anon, authenticated
  using (active or public.has_platform_permission('taxonomy.manage'));
create policy cities_insert on public.cities for insert to authenticated
  with check (public.has_platform_permission('taxonomy.manage'));
create policy cities_update on public.cities for update to authenticated
  using (public.has_platform_permission('taxonomy.manage')) with check (public.has_platform_permission('taxonomy.manage'));
create policy cities_delete on public.cities for delete to authenticated
  using (public.has_platform_permission('taxonomy.manage'));

create policy areas_select on public.areas for select to anon, authenticated
  using (active or public.has_platform_permission('taxonomy.manage'));
create policy areas_insert on public.areas for insert to authenticated
  with check (public.has_platform_permission('taxonomy.manage'));
create policy areas_update on public.areas for update to authenticated
  using (public.has_platform_permission('taxonomy.manage')) with check (public.has_platform_permission('taxonomy.manage'));
create policy areas_delete on public.areas for delete to authenticated
  using (public.has_platform_permission('taxonomy.manage'));

-- auspicious_dates: only published dates are public
grant select on public.auspicious_dates to anon, authenticated;
grant insert, update, delete on public.auspicious_dates to authenticated;

create policy auspicious_dates_select on public.auspicious_dates for select to anon, authenticated
  using (is_published or public.has_platform_permission('auspicious_dates.manage'));
create policy auspicious_dates_insert on public.auspicious_dates for insert to authenticated
  with check (public.has_platform_permission('auspicious_dates.manage'));
create policy auspicious_dates_update on public.auspicious_dates for update to authenticated
  using (public.has_platform_permission('auspicious_dates.manage')) with check (public.has_platform_permission('auspicious_dates.manage'));
create policy auspicious_dates_delete on public.auspicious_dates for delete to authenticated
  using (public.has_platform_permission('auspicious_dates.manage'));

-- ---------------------------------------------------------------------------
-- organizations (insert via public.create_organization RPC only)
-- ---------------------------------------------------------------------------
grant select on public.organizations to authenticated;
grant update (name, legal_name, primary_business_category_id, primary_city_id) on public.organizations to authenticated;

create policy organizations_select_member_or_admin on public.organizations
  for select to authenticated
  using (public.is_org_member(id) or public.has_platform_permission('organizations.read'));

create policy organizations_update_owner on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner']))
  with check (public.has_org_role(id, array['owner']));

-- ---------------------------------------------------------------------------
-- organization_members (invitations arrive in Phase 3 via RPC)
-- ---------------------------------------------------------------------------
grant select, delete on public.organization_members to authenticated;
grant update (role, status) on public.organization_members to authenticated;

create policy org_members_select on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id) or public.has_platform_permission('organizations.read'));

create policy org_members_update_owner on public.organization_members
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner']))
  with check (public.has_org_role(organization_id, array['owner']));

create policy org_members_delete_owner on public.organization_members
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner']));

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.branches to authenticated;

create policy branches_select on public.branches
  for select to authenticated
  using (public.can_access_branch(id) or public.has_platform_permission('organizations.read'));

create policy branches_insert_owner on public.branches
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner']));

create policy branches_update_owner_or_manager on public.branches
  for update to authenticated
  using (private.can_manage_resource(organization_id, id))
  with check (private.can_manage_resource(organization_id, id));

create policy branches_delete_owner on public.branches
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner']));

-- ---------------------------------------------------------------------------
-- member_branch_access
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.member_branch_access to authenticated;

create policy mba_select on public.member_branch_access
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy mba_insert_owner on public.member_branch_access
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner']));

create policy mba_delete_owner on public.member_branch_access
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner']));

-- ---------------------------------------------------------------------------
-- business_profiles (row created by create_organization)
-- ---------------------------------------------------------------------------
grant select on public.business_profiles to authenticated;
grant update (display_name, tagline, description, year_established, gstin, pan,
              contact_email, contact_phone, whatsapp_phone, website, languages)
  on public.business_profiles to authenticated;

create policy business_profiles_select on public.business_profiles
  for select to authenticated
  using (public.is_org_member(organization_id) or public.has_platform_permission('organizations.read'));

create policy business_profiles_update_owner on public.business_profiles
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner']))
  with check (public.has_org_role(organization_id, array['owner']));

-- ---------------------------------------------------------------------------
-- business_documents (KYC). Review decisions go through an RPC (Phase 3/8).
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.business_documents to authenticated;

create policy business_documents_select on public.business_documents
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner'])
         or public.has_platform_permission('verification.manage'));

create policy business_documents_insert_owner on public.business_documents
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner'])
              and uploaded_by = (select auth.uid())
              and status = 'uploaded'
              and reviewed_by is null);

create policy business_documents_delete_owner_unreviewed on public.business_documents
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner']) and status = 'uploaded');

-- ---------------------------------------------------------------------------
-- audit_logs: read requires audit.read; writes only by definer functions
-- ---------------------------------------------------------------------------
grant select on public.audit_logs to authenticated;

create policy audit_logs_select_auditors on public.audit_logs
  for select to authenticated
  using (public.has_platform_permission('audit.read'));

-- ---------------------------------------------------------------------------
-- policy_versions
-- ---------------------------------------------------------------------------
grant select on public.policy_versions to anon, authenticated;
grant insert, update, delete on public.policy_versions to authenticated;

create policy policy_versions_select on public.policy_versions for select to anon, authenticated
  using ((published_at is not null and published_at <= now()) or public.has_platform_permission('policies.manage'));
create policy policy_versions_insert on public.policy_versions for insert to authenticated
  with check (public.has_platform_permission('policies.manage'));
create policy policy_versions_update on public.policy_versions for update to authenticated
  using (public.has_platform_permission('policies.manage')) with check (public.has_platform_permission('policies.manage'));
create policy policy_versions_delete on public.policy_versions for delete to authenticated
  using (public.has_platform_permission('policies.manage'));

-- ---------------------------------------------------------------------------
-- consent_records: append-only, own rows
-- ---------------------------------------------------------------------------
grant select, insert on public.consent_records to authenticated;

create policy consent_records_select_own on public.consent_records
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy consent_records_insert_own on public.consent_records
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- notification_preferences: own rows
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.notification_preferences to authenticated;

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notification_preferences_delete_own on public.notification_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- bookable_resources
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.bookable_resources to authenticated;
grant update (branch_id, kind, service_id, staff_profile_id, name, allocation_mode, capacity,
              setup_buffer_min, breakdown_buffer_min, travel_buffer_min, active)
  on public.bookable_resources to authenticated;

create policy bookable_resources_select on public.bookable_resources
  for select to authenticated
  using (private.can_view_resource(id));

create policy bookable_resources_insert on public.bookable_resources
  for insert to authenticated
  with check (private.can_manage_resource(organization_id, branch_id)
              and (created_by is null or created_by = (select auth.uid())));

create policy bookable_resources_update on public.bookable_resources
  for update to authenticated
  using (private.can_manage_resource(organization_id, branch_id))
  with check (private.can_manage_resource(organization_id, branch_id));

create policy bookable_resources_delete_owner on public.bookable_resources
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner']));

-- ---------------------------------------------------------------------------
-- resource_reservations: read-only to clients; writes via reserve_resource()
-- and release_reservation() RPCs (migration 1000)
-- ---------------------------------------------------------------------------
grant select on public.resource_reservations to authenticated;

create policy resource_reservations_select on public.resource_reservations
  for select to authenticated
  using (private.can_view_resource(resource_id));
