-- =============================================================================
-- 2300 · Roadmap C6/V4: listing packages
--   "Gold – hall + 300 plates + stage décor" with what's included and what
--   isn't. Vendors manage them on the listing; customers see them on the
--   listing page; vendors quote from a package in one tap.
-- =============================================================================

create table public.service_packages (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_id      uuid not null,
  name            text not null check (char_length(trim(name)) between 2 and 60),
  description     text check (char_length(description) <= 300),
  price_paise     bigint not null check (price_paise between 0 and 100000000000),
  price_unit      public.price_unit,                   -- null = for the whole package
  includes        text[] not null default '{}' check (cardinality(includes) <= 20),
  excludes        text[] not null default '{}' check (cardinality(excludes) <= 20),
  sort_order      int not null default 0 check (sort_order between 0 and 100),
  active          boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (service_id, organization_id) references public.services (id, organization_id) on delete cascade
);

create index service_packages_service_idx on public.service_packages (service_id, sort_order) where active;

-- Each include/exclude line: 1–80 characters.
create or replace function private.valid_package_lines(p_lines text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(trim(l)) between 1 and 80), true) from unnest(p_lines) l;
$$;
alter table public.service_packages
  add constraint service_packages_lines_check check (private.valid_package_lines(includes) and private.valid_package_lines(excludes));

-- At most 6 active packages per listing (keeps the listing page readable).
create or replace function private.limit_service_packages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active and (select count(*) from public.service_packages p
                     where p.service_id = new.service_id and p.active and p.id <> new.id) >= 6 then
    raise exception 'A listing can show up to 6 packages' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger service_packages_limit before insert or update of active, service_id on public.service_packages
  for each row execute function private.limit_service_packages();
create trigger service_packages_set_updated_at before update on public.service_packages
  for each row execute function public.set_updated_at();
create trigger audit_service_packages after insert or update or delete on public.service_packages
  for each row execute function private.audit_row_change();

alter table public.service_packages enable row level security;
grant select, insert, update, delete on public.service_packages to authenticated;

create policy service_packages_select on public.service_packages for select to authenticated
  using (public.is_org_member(organization_id) or public.has_platform_permission('organizations.read'));
create policy service_packages_insert on public.service_packages for insert to authenticated
  with check (private.can_manage_service(service_id) and created_by = (select auth.uid()));
create policy service_packages_update on public.service_packages for update to authenticated
  using (private.can_manage_service(service_id)) with check (private.can_manage_service(service_id));
create policy service_packages_delete on public.service_packages for delete to authenticated
  using (private.can_manage_service(service_id));

-- Public: the active packages of a live listing.
create or replace function public.listing_packages(p_service_id uuid)
returns table (id uuid, name text, description text, price_paise bigint, price_unit public.price_unit,
               includes text[], excludes text[])
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.description, p.price_paise, p.price_unit, p.includes, p.excludes
  from public.service_packages p
  join public.services s on s.id = p.service_id
  join public.organizations o on o.id = s.organization_id
  where p.service_id = p_service_id and p.active and s.status = 'published' and o.status = 'active'
  order by p.sort_order, p.price_paise, p.name;
$$;
revoke all on function public.listing_packages(uuid) from public;
grant execute on function public.listing_packages(uuid) to anon, authenticated;
