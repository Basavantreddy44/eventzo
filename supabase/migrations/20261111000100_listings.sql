-- =============================================================================
-- 1200 · Phase 2: listings (services), category extensions, media,
--        budget benchmarks (enhancement F) and public discovery RPCs
--
-- Visibility rule (product owner, 11 Nov 2026): a service is public when it is
-- `published` AND its organisation is `active`. Verified vendors get a badge
-- and rank first, but verification is not required to be listed.
--
-- The raw tables are NOT readable by anonymous users. Public discovery goes
-- through two SECURITY DEFINER functions that return a fixed set of safe
-- columns: public.search_listings() and public.get_listing().
-- =============================================================================

-- ---------- enums -------------------------------------------------------------
create type public.service_status as enum ('draft', 'published', 'paused', 'archived');
create type public.price_type     as enum ('fixed', 'starting_from', 'range', 'on_request');
create type public.price_unit     as enum ('per_event', 'per_day', 'per_plate', 'per_person', 'per_hour', 'per_session');
create type public.outside_policy as enum ('in_house_only', 'outside_allowed', 'both');
create type public.budget_unit    as enum ('per_guest', 'per_event');

-- ---------- services ------------------------------------------------------------
create table public.services (
  id                  uuid primary key default extensions.gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  branch_id           uuid,
  service_category_id uuid not null references public.service_categories (id) on delete restrict,
  slug                extensions.citext not null unique
                        check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 90),
  title               text not null check (char_length(trim(title)) between 3 and 120),
  summary             text check (char_length(summary) <= 300),
  description         text check (char_length(description) <= 5000),
  booking_mode        public.booking_mode not null default 'request',   -- enhancement G
  status              public.service_status not null default 'draft',
  price_type          public.price_type not null default 'on_request',
  price_unit          public.price_unit,
  base_price_paise    bigint check (base_price_paise >= 0),
  max_price_paise     bigint check (max_price_paise >= 0),
  currency            char(3) not null default 'INR',
  min_guests          int check (min_guests > 0),
  max_guests          int check (max_guests > 0),
  city_id             uuid not null references public.cities (id) on delete restrict,
  area_id             uuid references public.areas (id) on delete set null,
  -- category-specific attributes for categories without a typed extension table
  attributes          jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  search_document     tsvector,
  published_at        timestamptz,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (branch_id, organization_id) references public.branches (id, organization_id) on delete set null (branch_id),
  constraint services_price_present check (price_type = 'on_request' or (base_price_paise is not null and price_unit is not null)),
  constraint services_price_range check (
    price_type <> 'range' or (max_price_paise is not null and max_price_paise >= base_price_paise)
  ),
  constraint services_guest_range check (min_guests is null or max_guests is null or min_guests <= max_guests)
);

create index services_public_idx    on public.services (city_id, service_category_id) where status = 'published';
create index services_org_idx       on public.services (organization_id, status);
create index services_search_idx    on public.services using gin (search_document);
create index services_title_trgm    on public.services using gin (title extensions.gin_trgm_ops);

-- ---------- typed extensions for the launch categories (D4) ---------------------
create table public.venue_details (
  service_id        uuid primary key,
  organization_id   uuid not null,
  seated_capacity   int check (seated_capacity > 0),
  floating_capacity int check (floating_capacity > 0),
  dining_capacity   int check (dining_capacity > 0),
  rooms             int check (rooms >= 0),
  parking_cars      int check (parking_cars >= 0),
  area_sqft         int check (area_sqft > 0),
  air_conditioned   boolean,
  catering_policy   public.outside_policy,
  decor_policy      public.outside_policy,
  alcohol_allowed   boolean,
  updated_at        timestamptz not null default now(),
  foreign key (service_id, organization_id) references public.services (id, organization_id) on delete cascade
);

create table public.catering_details (
  service_id                   uuid primary key,
  organization_id              uuid not null,
  veg_price_per_plate_paise    bigint check (veg_price_per_plate_paise >= 0),
  nonveg_price_per_plate_paise bigint check (nonveg_price_per_plate_paise >= 0),
  cuisines                     text[] not null default '{}',
  min_plates                   int check (min_plates > 0),
  max_plates                   int check (max_plates > 0),
  live_counters                boolean,
  service_staff_included       boolean,
  updated_at                   timestamptz not null default now(),
  check (min_plates is null or max_plates is null or min_plates <= max_plates),
  foreign key (service_id, organization_id) references public.services (id, organization_id) on delete cascade
);

-- ---------- media ----------------------------------------------------------------
create table public.service_media (
  id              uuid primary key default extensions.gen_random_uuid(),
  service_id      uuid not null,
  organization_id uuid not null,
  -- object path in the public `listing-media` bucket: {organization_id}/{uuid}.{ext}
  storage_path    text not null unique check (storage_path like organization_id::text || '/%'),
  alt_text        text check (char_length(alt_text) <= 200),
  sort_order      int not null default 0,
  is_cover        boolean not null default false,
  created_at      timestamptz not null default now(),
  foreign key (service_id, organization_id) references public.services (id, organization_id) on delete cascade
);

create index service_media_service_idx on public.service_media (service_id, sort_order);
create unique index service_media_one_cover on public.service_media (service_id) where is_cover;

-- ---------- budget benchmarks (enhancement F) --------------------------------------
-- Admin-entered price ranges per business category and city. Real figures are
-- entered by the Eventzo team; dev seed values are labelled samples.
create table public.budget_benchmarks (
  id                   uuid primary key default extensions.gen_random_uuid(),
  business_category_id uuid not null references public.business_categories (id) on delete cascade,
  city_id              uuid not null references public.cities (id) on delete cascade,
  unit                 public.budget_unit not null,
  low_paise            bigint not null check (low_paise >= 0),
  high_paise           bigint not null,
  notes                text check (char_length(notes) <= 500),
  source               text check (char_length(source) <= 200),
  is_published         boolean not null default false,
  updated_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (business_category_id, city_id),
  check (high_paise >= low_paise)
);

-- ---------- permission for pricing data ---------------------------------------------
insert into public.permissions (code, description) values
  ('pricing.manage', 'Manage budget-estimator price ranges');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where p.code = 'pricing.manage' and r.code in ('super_admin', 'finance_operator');

-- ---------- triggers ----------------------------------------------------------------
-- Builds slug, publish timestamp and the search document. 'simple' text-search
-- config: no English stemming, so Kannada / Hindi words are indexed as typed.
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

  if new.slug is null or (tg_op = 'UPDATE' and new.slug is distinct from old.slug and new.slug = '') then
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

create trigger services_prepare
  before insert or update on public.services
  for each row execute function private.prepare_service();

-- Keep the search document in step with the organisation name.
create or replace function private.refresh_service_search_for_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.services set title = title where organization_id = new.id;
  return new;
end;
$$;

create trigger organizations_refresh_service_search
  after update of name on public.organizations
  for each row
  when (old.name is distinct from new.name)
  execute function private.refresh_service_search_for_org();

create trigger services_set_updated_at          before update on public.services          for each row execute function public.set_updated_at();
create trigger venue_details_set_updated_at     before update on public.venue_details     for each row execute function public.set_updated_at();
create trigger catering_details_set_updated_at  before update on public.catering_details  for each row execute function public.set_updated_at();
create trigger budget_benchmarks_set_updated_at before update on public.budget_benchmarks for each row execute function public.set_updated_at();

create trigger audit_services          after insert or update or delete on public.services          for each row execute function private.audit_row_change('search_document');
create trigger audit_venue_details     after insert or update or delete on public.venue_details     for each row execute function private.audit_row_change();
create trigger audit_catering_details  after insert or update or delete on public.catering_details  for each row execute function private.audit_row_change();
create trigger audit_service_media     after insert or update or delete on public.service_media     for each row execute function private.audit_row_change();
create trigger audit_budget_benchmarks after insert or update or delete on public.budget_benchmarks for each row execute function private.audit_row_change();

-- ---------- RLS ----------------------------------------------------------------------
-- Can the caller manage this service (owner, or branch manager of its branch)?
create or replace function private.can_manage_service(p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.services s
    where s.id = p_service_id and private.can_manage_resource(s.organization_id, s.branch_id)
  );
$$;

revoke all on function private.can_manage_service(uuid) from public, anon;
grant execute on function private.can_manage_service(uuid) to authenticated, service_role;

alter table public.services          enable row level security;
alter table public.venue_details     enable row level security;
alter table public.catering_details  enable row level security;
alter table public.service_media     enable row level security;
alter table public.budget_benchmarks enable row level security;

revoke all on public.services, public.venue_details, public.catering_details, public.service_media, public.budget_benchmarks
  from anon, authenticated;

-- services: vendor members read; owner / branch manager write. The public
-- reads published listings only through the discovery RPCs below.
grant select, insert, delete on public.services to authenticated;
grant update (branch_id, service_category_id, title, summary, description, booking_mode, status, price_type, price_unit,
              base_price_paise, max_price_paise, min_guests, max_guests, city_id, area_id, attributes)
  on public.services to authenticated;

create policy services_select on public.services for select to authenticated
  using (public.is_org_member(organization_id) or public.has_platform_permission('organizations.read'));
create policy services_insert on public.services for insert to authenticated
  with check (private.can_manage_resource(organization_id, branch_id) and created_by = (select auth.uid()));
create policy services_update on public.services for update to authenticated
  using (private.can_manage_resource(organization_id, branch_id))
  with check (private.can_manage_resource(organization_id, branch_id));
create policy services_delete on public.services for delete to authenticated
  using (public.has_org_role(organization_id, array['owner']));

-- typed extensions + media follow their service
grant select, insert, update, delete on public.venue_details, public.catering_details to authenticated;
grant select, insert, delete on public.service_media to authenticated;
grant update (alt_text, sort_order, is_cover) on public.service_media to authenticated;

create policy venue_details_select on public.venue_details for select to authenticated
  using (public.is_org_member(organization_id) or public.has_platform_permission('organizations.read'));
create policy venue_details_write on public.venue_details for all to authenticated
  using (private.can_manage_service(service_id)) with check (private.can_manage_service(service_id));

create policy catering_details_select on public.catering_details for select to authenticated
  using (public.is_org_member(organization_id) or public.has_platform_permission('organizations.read'));
create policy catering_details_write on public.catering_details for all to authenticated
  using (private.can_manage_service(service_id)) with check (private.can_manage_service(service_id));

create policy service_media_select on public.service_media for select to authenticated
  using (public.is_org_member(organization_id) or public.has_platform_permission('organizations.read'));
create policy service_media_insert on public.service_media for insert to authenticated
  with check (private.can_manage_service(service_id));
create policy service_media_update on public.service_media for update to authenticated
  using (private.can_manage_service(service_id)) with check (private.can_manage_service(service_id));
create policy service_media_delete on public.service_media for delete to authenticated
  using (private.can_manage_service(service_id));

-- budget benchmarks: published ranges are public; pricing.manage writes
grant select on public.budget_benchmarks to anon, authenticated;
grant insert, update, delete on public.budget_benchmarks to authenticated;

create policy budget_benchmarks_select on public.budget_benchmarks for select to anon, authenticated
  using (is_published or public.has_platform_permission('pricing.manage'));
create policy budget_benchmarks_insert on public.budget_benchmarks for insert to authenticated
  with check (public.has_platform_permission('pricing.manage'));
create policy budget_benchmarks_update on public.budget_benchmarks for update to authenticated
  using (public.has_platform_permission('pricing.manage')) with check (public.has_platform_permission('pricing.manage'));
create policy budget_benchmarks_delete on public.budget_benchmarks for delete to authenticated
  using (public.has_platform_permission('pricing.manage'));

-- ---------- storage: public listing photos ---------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-media', 'listing-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy listing_media_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-media'
    and public.has_org_role(private.try_uuid((storage.foldername(name))[1]), array['owner', 'branch_manager'])
  );

create policy listing_media_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-media'
    and public.has_org_role(private.try_uuid((storage.foldername(name))[1]), array['owner', 'branch_manager'])
  );

-- ---------- public discovery RPCs -------------------------------------------------------
create or replace function public.search_listings(
  p_query            text default null,
  p_city             text default null,   -- city slug
  p_category         text default null,   -- business category slug
  p_service_category text default null,   -- service category slug
  p_guests           int default null,
  p_max_price_paise  bigint default null,
  p_sort             text default 'recommended',  -- recommended | relevance | price_asc | price_desc | capacity
  p_limit            int default 24,
  p_offset           int default 0
)
returns table (
  id                        uuid,
  slug                      text,
  title                     text,
  summary                   text,
  business_category_slug    text,
  business_category_name    text,
  business_category_icon    text,
  service_category_slug     text,
  service_category_name     text,
  organization_name         text,
  verified                  boolean,
  city_name                 text,
  area_name                 text,
  price_type                public.price_type,
  price_unit                public.price_unit,
  base_price_paise          bigint,
  max_price_paise           bigint,
  currency                  text,
  booking_mode              public.booking_mode,
  max_capacity              int,
  veg_price_per_plate_paise bigint,
  cover_path                text,
  total_count               bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select nullif(trim(left(p_query, 100)), '') as raw
  ), q2 as (
    select raw, case when raw is null then null else websearch_to_tsquery('simple', raw) end as tsq from q
  ), base as (
    select
      s.id, s.slug::text as slug, s.title, s.summary,
      bc.slug::text as business_category_slug, bc.name as business_category_name, bc.icon as business_category_icon,
      sc.slug::text as service_category_slug, sc.name as service_category_name,
      o.name as organization_name, (o.verification_status = 'verified') as verified,
      c.name as city_name, a.name as area_name,
      s.price_type, s.price_unit, s.base_price_paise, s.max_price_paise, s.currency::text as currency, s.booking_mode,
      nullif(greatest(coalesce(vd.seated_capacity, 0), coalesce(vd.floating_capacity, 0), coalesce(s.max_guests, 0)), 0) as max_capacity,
      cd.veg_price_per_plate_paise,
      (select m.storage_path from public.service_media m
        where m.service_id = s.id order by m.is_cover desc, m.sort_order, m.created_at limit 1) as cover_path,
      s.published_at,
      case when q2.tsq is null then 0
           else ts_rank_cd(s.search_document, q2.tsq) + extensions.similarity(s.title, q2.raw) end as rank
    from public.services s
    join public.organizations o        on o.id = s.organization_id
    join public.service_categories sc  on sc.id = s.service_category_id
    join public.business_categories bc on bc.id = sc.business_category_id
    join public.cities c               on c.id = s.city_id
    left join public.areas a           on a.id = s.area_id
    left join public.venue_details vd  on vd.service_id = s.id
    left join public.catering_details cd on cd.service_id = s.id
    cross join q2
    where s.status = 'published'
      and o.status = 'active'
      and sc.active and bc.active and c.active
      and (p_city is null or c.slug::text = lower(p_city))
      and (p_category is null or bc.slug::text = lower(p_category))
      and (p_service_category is null or sc.slug::text = lower(p_service_category))
      and (p_guests is null or (
            (s.min_guests is null or s.min_guests <= p_guests)
        and (s.max_guests is null or s.max_guests >= p_guests)
        and (vd.service_id is null
             or greatest(coalesce(vd.seated_capacity, 0), coalesce(vd.floating_capacity, 0)) = 0
             or greatest(coalesce(vd.seated_capacity, 0), coalesce(vd.floating_capacity, 0)) >= p_guests)))
      and (p_max_price_paise is null or (s.base_price_paise is not null and s.base_price_paise <= p_max_price_paise))
      and (q2.tsq is null
           or s.search_document @@ q2.tsq
           or extensions.similarity(s.title, q2.raw) > 0.25)
  )
  select
    b.id, b.slug, b.title, b.summary, b.business_category_slug, b.business_category_name, b.business_category_icon,
    b.service_category_slug, b.service_category_name, b.organization_name, b.verified, b.city_name, b.area_name,
    b.price_type, b.price_unit, b.base_price_paise, b.max_price_paise, b.currency, b.booking_mode,
    b.max_capacity, b.veg_price_per_plate_paise, b.cover_path,
    count(*) over () as total_count
  from base b
  order by
    case when p_sort = 'price_asc'  then b.base_price_paise end asc nulls last,
    case when p_sort = 'price_desc' then b.base_price_paise end desc nulls last,
    case when p_sort = 'capacity'   then b.max_capacity end desc nulls last,
    case when p_sort = 'relevance'  then b.rank end desc,
    b.verified desc,
    b.rank desc,
    b.published_at desc nulls last,
    b.id
  limit least(greatest(coalesce(p_limit, 24), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Full public detail of one published listing (no vendor contact details:
-- enquiries go through the platform from Phase 4).
create or replace function public.get_listing(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'slug', s.slug,
    'title', s.title,
    'summary', s.summary,
    'description', s.description,
    'booking_mode', s.booking_mode,
    'price_type', s.price_type,
    'price_unit', s.price_unit,
    'base_price_paise', s.base_price_paise,
    'max_price_paise', s.max_price_paise,
    'currency', s.currency,
    'min_guests', s.min_guests,
    'max_guests', s.max_guests,
    'attributes', s.attributes,
    'published_at', s.published_at,
    'category', jsonb_build_object(
      'slug', sc.slug, 'name', sc.name, 'name_i18n', sc.name_i18n,
      'business_slug', bc.slug, 'business_name', bc.name, 'business_name_i18n', bc.name_i18n, 'icon', bc.icon),
    'location', jsonb_build_object(
      'city_slug', c.slug, 'city', c.name, 'city_i18n', c.name_i18n, 'state', c.state,
      'area', a.name, 'timezone', c.timezone),
    'vendor', jsonb_build_object(
      'name', o.name,
      'verified', o.verification_status = 'verified',
      'tagline', bp.tagline,
      'about', bp.description,
      'year_established', bp.year_established,
      'languages', coalesce(to_jsonb(bp.languages), '[]'::jsonb)),
    'venue', case when vd.service_id is null then null else jsonb_build_object(
      'seated_capacity', vd.seated_capacity, 'floating_capacity', vd.floating_capacity,
      'dining_capacity', vd.dining_capacity, 'rooms', vd.rooms, 'parking_cars', vd.parking_cars,
      'area_sqft', vd.area_sqft, 'air_conditioned', vd.air_conditioned,
      'catering_policy', vd.catering_policy, 'decor_policy', vd.decor_policy,
      'alcohol_allowed', vd.alcohol_allowed) end,
    'catering', case when cd.service_id is null then null else jsonb_build_object(
      'veg_price_per_plate_paise', cd.veg_price_per_plate_paise,
      'nonveg_price_per_plate_paise', cd.nonveg_price_per_plate_paise,
      'cuisines', to_jsonb(cd.cuisines), 'min_plates', cd.min_plates, 'max_plates', cd.max_plates,
      'live_counters', cd.live_counters, 'service_staff_included', cd.service_staff_included) end,
    'media', coalesce((
      select jsonb_agg(jsonb_build_object('path', m.storage_path, 'alt', m.alt_text, 'is_cover', m.is_cover)
                       order by m.is_cover desc, m.sort_order, m.created_at)
      from public.service_media m where m.service_id = s.id), '[]'::jsonb)
  )
  from public.services s
  join public.organizations o        on o.id = s.organization_id
  join public.service_categories sc  on sc.id = s.service_category_id
  join public.business_categories bc on bc.id = sc.business_category_id
  join public.cities c               on c.id = s.city_id
  left join public.areas a           on a.id = s.area_id
  left join public.business_profiles bp on bp.organization_id = o.id
  left join public.venue_details vd  on vd.service_id = s.id
  left join public.catering_details cd on cd.service_id = s.id
  where s.slug operator(extensions.=) p_slug::extensions.citext  -- uses the unique citext index
    and s.status = 'published'
    and o.status = 'active'
    and sc.active and bc.active;
$$;

revoke all on function public.search_listings(text, text, text, text, int, bigint, text, int, int) from public;
revoke all on function public.get_listing(text) from public;
grant execute on function public.search_listings(text, text, text, text, int, bigint, text, int, int) to anon, authenticated;
grant execute on function public.get_listing(text) to anon, authenticated;

revoke all on all functions in schema private from public, anon;
