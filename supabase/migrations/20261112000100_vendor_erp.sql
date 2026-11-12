-- =============================================================================
-- 1300 · Phase 3: vendor onboarding & ERP core
--   * automatic go-live (draft → active) when the vendor is complete
--   * KYC verification workflow (pending on upload, staff review RPCs)
--   * team invitations by email + member directory
-- Decisions (product owner, 11 Nov 2026):
--   go-live = automatic once profile (description + phone) is complete AND at
--             least one listing is published; verification is a separate badge
--   team    = email invitations; existing users accept in their account
--   review  = minimal verification queue for verification operators
-- =============================================================================

-- ---------- automatic go-live ------------------------------------------------
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
     and o.status = 'draft'   -- never re-activates suspended / closed vendors
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
      null, jsonb_build_object('status', 'active'), jsonb_build_object('rule', 'profile_complete_and_published_listing'));
  end if;
end;
$$;

create or replace function private.activation_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.try_activate_organization(new.organization_id);
  return new;
end;
$$;

create trigger business_profiles_try_activate
  after insert or update on public.business_profiles
  for each row execute function private.activation_trigger();

create trigger services_try_activate
  after insert or update of status on public.services
  for each row
  when (new.status = 'published')
  execute function private.activation_trigger();

-- ---------- verification workflow ---------------------------------------------
-- Uploading a document puts the vendor in the review queue.
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
     and verification_status in ('unverified', 'rejected');
  return new;
end;
$$;

create trigger business_documents_mark_pending
  after insert on public.business_documents
  for each row execute function private.mark_verification_pending();

create or replace function public.review_business_document(p_document_id uuid, p_approve boolean, p_reason text default null)
returns public.business_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.business_documents%rowtype;
begin
  if not public.has_platform_permission('verification.manage') then
    raise exception 'Not allowed to review documents' using errcode = '42501';
  end if;
  if not p_approve and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required when rejecting a document' using errcode = '22023';
  end if;

  update public.business_documents
     set status = case when p_approve then 'approved'::public.document_status else 'rejected'::public.document_status end,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         rejection_reason = case when p_approve then null else left(trim(p_reason), 500) end
   where id = p_document_id
  returning * into v_doc;

  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  return v_doc;
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
  return v_org;
end;
$$;

-- ---------- team invitations ------------------------------------------------------
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'revoked', 'expired');

create table public.organization_invitations (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email           extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  role            public.org_role not null check (role in ('branch_manager', 'staff')),
  branch_ids      uuid[] not null default '{}',
  status          public.invitation_status not null default 'pending',
  invited_by      uuid references public.profiles (id) on delete set null,
  expires_at      timestamptz not null default now() + interval '14 days',
  responded_at    timestamptz,
  accepted_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index organization_invitations_one_pending
  on public.organization_invitations (organization_id, email) where status = 'pending';
create index organization_invitations_email_idx on public.organization_invitations (email) where status = 'pending';

create trigger organization_invitations_set_updated_at before update on public.organization_invitations
  for each row execute function public.set_updated_at();
create trigger audit_organization_invitations after insert or update or delete on public.organization_invitations
  for each row execute function private.audit_row_change();

alter table public.organization_invitations enable row level security;
revoke all on public.organization_invitations from anon, authenticated;
grant select on public.organization_invitations to authenticated;

create policy organization_invitations_select on public.organization_invitations
  for select to authenticated
  using (
    public.has_org_role(organization_id, array['owner'])
    or email = (select p.email from public.profiles p where p.id = (select auth.uid()))
  );

-- Caller's email (from their profile, which mirrors auth.users.email).
create or replace function private.caller_email()
returns extensions.citext
language sql
stable
security definer
set search_path = ''
as $$
  select p.email from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function public.create_invitation(
  p_organization_id uuid,
  p_email           text,
  p_role            public.org_role,
  p_branch_ids      uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext := lower(trim(coalesce(p_email, '')));
  v_id    uuid;
begin
  if not public.has_org_role(p_organization_id, array['owner']) then
    raise exception 'Only owners can invite team members' using errcode = '42501';
  end if;
  if p_role not in ('branch_manager', 'staff') then
    raise exception 'Invite as branch manager or staff' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_branch_ids, '{}')) b(id)
    where not exists (select 1 from public.branches br where br.id = b.id and br.organization_id = p_organization_id)
  ) then
    raise exception 'Unknown branch for this organisation' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id and p.email = v_email and m.status = 'active'
  ) then
    raise exception 'This person is already a team member' using errcode = '23505';
  end if;
  if (select count(*) from public.organization_invitations i
      where i.organization_id = p_organization_id and i.created_at > now() - interval '1 day') >= 50 then
    raise exception 'Too many invitations today' using errcode = '54000';
  end if;

  -- Expire stale pending invitations so a fresh one can be sent.
  update public.organization_invitations
     set status = 'expired'
   where organization_id = p_organization_id and email = v_email and status = 'pending' and expires_at < now();

  insert into public.organization_invitations (organization_id, email, role, branch_ids, invited_by)
  values (p_organization_id, v_email, p_role, coalesce(p_branch_ids, '{}'), auth.uid())
  returning id into v_id;   -- unique index → 23505 when a pending invite already exists

  return v_id;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.organization_invitations where id = p_invitation_id;
  if v_org is null or not public.has_org_role(v_org, array['owner']) then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  update public.organization_invitations
     set status = 'revoked', responded_at = now()
   where id = p_invitation_id and status = 'pending';
end;
$$;

create or replace function public.respond_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid   -- organization id
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv    public.organization_invitations%rowtype;
  v_uid    uuid := auth.uid();
  v_member uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_inv from public.organization_invitations where id = p_invitation_id for update;
  if not found or v_inv.email is distinct from private.caller_email() then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'This invitation is no longer open' using errcode = '22023';
  end if;
  if v_inv.expires_at < now() then
    update public.organization_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'This invitation has expired' using errcode = '22023';
  end if;

  if not p_accept then
    update public.organization_invitations set status = 'declined', responded_at = now() where id = v_inv.id;
    return v_inv.organization_id;
  end if;

  -- Existing members keep their current role (never downgrade an owner).
  insert into public.organization_members (organization_id, user_id, role, status, invited_by)
  values (v_inv.organization_id, v_uid, v_inv.role, 'active', v_inv.invited_by)
  on conflict (organization_id, user_id) do update set status = 'active'
  returning id into v_member;

  insert into public.member_branch_access (member_id, branch_id, organization_id)
  select v_member, b.id, v_inv.organization_id
  from unnest(v_inv.branch_ids) b(id)
  join public.branches br on br.id = b.id and br.organization_id = v_inv.organization_id
  on conflict do nothing;

  update public.organization_invitations
     set status = 'accepted', responded_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  return v_inv.organization_id;
end;
$$;

-- Pending invitations addressed to the caller (with the organisation name,
-- which the invitee cannot read directly yet).
create or replace function public.my_invitations()
returns table (id uuid, organization_id uuid, organization_name text, role public.org_role, expires_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.organization_id, o.name, i.role, i.expires_at, i.created_at
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id
  where i.email = private.caller_email()
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at desc;
$$;

-- Team directory. Members see names and roles; only owners and admins see emails.
create or replace function public.org_member_directory(p_organization_id uuid)
returns table (
  member_id    uuid,
  user_id      uuid,
  full_name    text,
  display_name text,
  email        text,
  role         public.org_role,
  status       public.member_status,
  branch_ids   uuid[],
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_see_email boolean;
begin
  if not (public.is_org_member(p_organization_id) or public.has_platform_permission('organizations.read')) then
    raise exception 'Not a member of this organisation' using errcode = '42501';
  end if;
  v_can_see_email := public.has_org_role(p_organization_id, array['owner']) or public.has_platform_permission('organizations.read');

  return query
  select m.id, m.user_id, p.full_name, p.display_name,
         case when v_can_see_email then p.email::text end,
         m.role, m.status,
         coalesce((select array_agg(a.branch_id) from public.member_branch_access a where a.member_id = m.id), '{}'),
         m.created_at
  from public.organization_members m
  join public.profiles p on p.id = m.user_id
  where m.organization_id = p_organization_id and m.status <> 'removed'
  order by (m.role = 'owner') desc, m.created_at;
end;
$$;

-- ---------- grants -------------------------------------------------------------------
revoke all on function public.review_business_document(uuid, boolean, text) from public, anon;
revoke all on function public.set_organization_verification(uuid, public.verification_status, text) from public, anon;
revoke all on function public.create_invitation(uuid, text, public.org_role, uuid[]) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.respond_invitation(uuid, boolean) from public, anon;
revoke all on function public.my_invitations() from public, anon;
revoke all on function public.org_member_directory(uuid) from public, anon;

grant execute on function public.review_business_document(uuid, boolean, text) to authenticated;
grant execute on function public.set_organization_verification(uuid, public.verification_status, text) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.org_role, uuid[]) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.respond_invitation(uuid, boolean) to authenticated;
grant execute on function public.my_invitations() to authenticated;
grant execute on function public.org_member_directory(uuid) to authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on function private.caller_email() to authenticated;

-- ---------- listings: '' slug on insert means "generate one" -----------------------
-- (Typed clients must send a value for the NOT NULL slug column.)
create or replace function private.prepare_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_doc_b text;
  v_doc_c text;
begin
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'A service cannot move to another organisation' using errcode = '42501';
  end if;

  if new.slug is null or new.slug = '' then
    v_base := left(private.slugify(new.title), 80);
    new.slug := v_base;
    while exists (select 1 from public.services s where s.slug = new.slug::extensions.citext and s.id <> new.id) loop
      new.slug := v_base || '-' || substr(md5(extensions.gen_random_uuid()::text), 1, 6);
    end loop;
  end if;

  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;

  select concat_ws(' ', sc.name, bc.name, o.name)
    into v_doc_b
    from public.service_categories sc
    join public.business_categories bc on bc.id = sc.business_category_id
    join public.organizations o on o.id = new.organization_id
   where sc.id = new.service_category_id;

  select concat_ws(' ', c.name, array_to_string(c.alt_names, ' '), a.name)
    into v_doc_c
    from public.cities c
    left join public.areas a on a.id = new.area_id
   where c.id = new.city_id;

  new.search_document :=
       setweight(to_tsvector('simple', coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(v_doc_b, '')), 'B')
    || setweight(to_tsvector('simple', concat_ws(' ', new.summary, v_doc_c)), 'C')
    || setweight(to_tsvector('simple', coalesce(new.description, '')), 'D');

  return new;
end;
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.caller_email() to authenticated;
