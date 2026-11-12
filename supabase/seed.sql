-- =============================================================================
--  DEV-ONLY SEED DATA — NEVER RUN AGAINST PRODUCTION
--  Loaded automatically by `supabase db reset` on the LOCAL stack only.
--  Real reference data (roles, permissions, categories, cities) lives in
--  migrations. Everything here is for local development and must be
--  re-verified before any of it is entered into production through the admin UI.
-- =============================================================================

-- ---------- areas (verify names and pincodes before production) ---------------
insert into public.areas (city_id, slug, name)
select c.id, v.slug, v.name
from (values
  ('kalaburagi', 'station-area',      'Station Area'),
  ('kalaburagi', 'super-market',      'Super Market'),
  ('kalaburagi', 'jewargi-road',      'Jewargi Road'),
  ('kalaburagi', 'sedam-road',        'Sedam Road'),
  ('kalaburagi', 'aland-road',        'Aland Road'),
  ('kalaburagi', 'brahmpur',          'Brahmpur'),
  ('kalaburagi', 'shahabazar',        'Shahabazar'),
  ('kalaburagi', 'khuba-plot',        'Khuba Plot'),
  ('bengaluru',  'jayanagar',         'Jayanagar'),
  ('bengaluru',  'basavanagudi',      'Basavanagudi'),
  ('bengaluru',  'malleshwaram',      'Malleshwaram'),
  ('bengaluru',  'rajajinagar',       'Rajajinagar'),
  ('bengaluru',  'jp-nagar',          'JP Nagar'),
  ('bengaluru',  'banashankari',      'Banashankari'),
  ('bengaluru',  'vijayanagar',       'Vijayanagar'),
  ('bengaluru',  'indiranagar',       'Indiranagar'),
  ('bengaluru',  'koramangala',       'Koramangala'),
  ('bengaluru',  'whitefield',        'Whitefield'),
  ('bengaluru',  'yelahanka',         'Yelahanka'),
  ('bengaluru',  'hsr-layout',        'HSR Layout')
) as v(city, slug, name)
join public.cities c on c.slug = v.city
on conflict (city_id, slug) do nothing;

-- ---------- auspicious dates: PLACEHOLDERS for UI development ----------------
-- NOT verified muhurtham dates. They are published in the LOCAL dev database
-- only so the calendar can be built and tested, and every title says
-- "DEV SAMPLE". Real dates must be entered by an admin from a trusted panchang.
insert into public.auspicious_dates (date, city_id, tradition, title, significance, muhurtham_windows, source, is_published)
select current_date + v.offset_days, c.id, 'general', 'DEV SAMPLE – not a real muhurtham', v.sig, v.windows::jsonb, 'dev seed', true
from (values
  (12, null,         3, '[{"start":"06:45","end":"08:15"}]'),
  (19, null,         2, '[{"start":"10:30","end":"12:00"}]'),
  (27, 'kalaburagi', 3, '[{"start":"07:10","end":"08:40"}]'),
  (33, 'bengaluru',  2, '[]'),
  (41, null,         1, '[]'),
  (48, null,         3, '[{"start":"06:30","end":"07:55"},{"start":"11:05","end":"12:20"}]'),
  (62, 'kalaburagi', 2, '[]'),
  (75, null,         3, '[]')
) as v(offset_days, city, sig, windows)
left join public.cities c on c.slug = v.city
on conflict do nothing;

-- =============================================================================
-- DEV LOGINS (local stack only). Password for all: Eventzo2027
--   admin@sample.eventzo.test             super admin
--   vendor.kalaburagi@sample.eventzo.test owns the Kalaburagi sample vendors
--   vendor.bengaluru@sample.eventzo.test  owns the Bengaluru sample vendors
--   customer@sample.eventzo.test          plain customer
-- =============================================================================
with u(id, email, full_name) as (values
  ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'admin@sample.eventzo.test',             'Sample Admin'),
  ('aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'vendor.kalaburagi@sample.eventzo.test', 'Sample Vendor Kalaburagi'),
  ('aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'vendor.bengaluru@sample.eventzo.test',  'Sample Vendor Bengaluru'),
  ('aaaaaaaa-0000-4000-8000-000000000004'::uuid, 'customer@sample.eventzo.test',          'Sample Customer')
), ins as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
         extensions.crypt('Eventzo2027', extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u.full_name),
         now(), now(), '', '', '', ''
  from u
  on conflict (id) do nothing
  returning id, email
)
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select ins.id::text, ins.id, jsonb_build_object('sub', ins.id::text, 'email', ins.email, 'email_verified', true),
       'email', now(), now(), now()
from ins;

insert into public.user_role_assignments (user_id, role_id)
select 'aaaaaaaa-0000-4000-8000-000000000001', id from public.roles where code = 'super_admin'
on conflict do nothing;

-- =============================================================================
-- SAMPLE VENDORS + LISTINGS. Names start with "Sample" so they can never be
-- mistaken for real businesses. Prices are invented for UI development.
-- =============================================================================
insert into public.organizations (id, name, slug, primary_business_category_id, primary_city_id, status, verification_status, verified_at, created_by)
select v.id::uuid, v.name, v.slug, bc.id, c.id, 'active', v.ver::public.verification_status,
       case when v.ver = 'verified' then now() end, v.owner::uuid
from (values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Sample Lakshmi Kalyana Mantapa',   'sample-lakshmi-kalyana-mantapa',   'venues',      'kalaburagi', 'verified',   'aaaaaaaa-0000-4000-8000-000000000002'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Sample Annapoorna Caterers',       'sample-annapoorna-caterers',       'catering',    'kalaburagi', 'unverified', 'aaaaaaaa-0000-4000-8000-000000000002'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'Sample Mallige Decorators',        'sample-mallige-decorators',        'decoration',  'kalaburagi', 'unverified', 'aaaaaaaa-0000-4000-8000-000000000002'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'Sample Royal Palace Convention',   'sample-royal-palace-convention',   'venues',      'bengaluru',  'verified',   'aaaaaaaa-0000-4000-8000-000000000003'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'Sample Bale Ele Caterers',         'sample-bale-ele-caterers',         'catering',    'bengaluru',  'verified',   'aaaaaaaa-0000-4000-8000-000000000003'),
  ('bbbbbbbb-0000-4000-8000-000000000006', 'Sample Kalpavruksha Floral Decor', 'sample-kalpavruksha-floral-decor', 'decoration',  'bengaluru',  'unverified', 'aaaaaaaa-0000-4000-8000-000000000003'),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'Sample Lens and Light Studio',     'sample-lens-and-light-studio',     'photography', 'bengaluru',  'unverified', 'aaaaaaaa-0000-4000-8000-000000000003')
) as v(id, name, slug, cat, city, ver, owner)
join public.business_categories bc on bc.slug = v.cat
join public.cities c on c.slug = v.city
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role, status)
select o.id, o.created_by, 'owner', 'active' from public.organizations o
where o.id::text like 'bbbbbbbb-%'
on conflict (organization_id, user_id) do nothing;

insert into public.business_profiles (organization_id, display_name, tagline, description, year_established, languages)
select o.id, o.name, 'Sample vendor for development',
       'This is a sample vendor created by the development seed. It is not a real business.', 2010, '{en,kn}'
from public.organizations o where o.id::text like 'bbbbbbbb-%'
on conflict (organization_id) do nothing;

insert into public.branches (organization_id, name, city_id, is_primary)
select o.id, o.name, o.primary_city_id, true from public.organizations o
where o.id::text like 'bbbbbbbb-%'
  and not exists (select 1 from public.branches b where b.organization_id = o.id);

insert into public.services (id, organization_id, service_category_id, slug, title, summary, description, booking_mode, status,
                             price_type, price_unit, base_price_paise, max_price_paise, min_guests, max_guests, city_id, area_id, attributes, created_by)
select v.id::uuid, v.org::uuid, sc.id, v.slug, v.title, v.summary, v.descr, v.mode::public.booking_mode, 'published',
       v.ptype::public.price_type, v.punit::public.price_unit, v.base, v.maxp, v.ming, v.maxg, c.id, a.id, v.attrs::jsonb, o.created_by
from (values
  ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'kalyana-mantapa', 'sample-lakshmi-main-hall',
     'Sample Lakshmi Kalyana Mantapa – Main Hall', 'Traditional kalyana mantapa with a large dining hall.',
     'Sample listing for development. Spacious mantapa suited to weddings and receptions, with a separate dining hall and bride and groom rooms.',
     'request', 'starting_from', 'per_day', 15000000::bigint, null::bigint, 200, 1200, 'kalaburagi', 'jewargi-road', '{}'),
  ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'banquet-hall', 'sample-lakshmi-mini-hall',
     'Sample Lakshmi Mini Hall', 'Air-conditioned hall for naming ceremonies and small functions.',
     'Sample listing for development. Compact AC hall for up to 150 guests.',
     'instant', 'fixed', 'per_day', 4500000, null, 30, 150, 'kalaburagi', 'jewargi-road', '{}'),
  ('dddddddd-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 'veg-catering', 'sample-annapoorna-veg-catering',
     'Sample Annapoorna Pure Veg Catering', 'North Karnataka and South Indian vegetarian menus.',
     'Sample listing for development. Jolada rotti, holige and full South Indian thali options.',
     'request', 'starting_from', 'per_plate', 25000, null, 100, 3000, 'kalaburagi', 'super-market', '{}'),
  ('dddddddd-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000003', 'mandap-decoration', 'sample-mallige-mandap-decor',
     'Sample Mallige Mandap Decoration', 'Fresh-flower mandap and stage decoration.',
     'Sample listing for development. Mallige and marigold mandap themes with stage backdrop.',
     'request', 'starting_from', 'per_event', 3500000, null, null, null, 'kalaburagi', 'station-area', '{"themes":["traditional","floral"]}'),
  ('dddddddd-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000004', 'convention-centre', 'sample-royal-palace-grand-hall',
     'Sample Royal Palace Grand Hall', 'Large AC convention hall with ample parking.',
     'Sample listing for development. Pillarless convention hall for grand weddings and receptions.',
     'request', 'range', 'per_day', 30000000, 60000000, 300, 2500, 'bengaluru', 'rajajinagar', '{}'),
  ('dddddddd-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000005', 'south-indian-traditional', 'sample-bale-ele-oota',
     'Sample Bale Ele Oota Catering', 'Traditional banana-leaf meals, veg and non-veg.',
     'Sample listing for development. Authentic bale ele oota with 18+ items.',
     'request', 'starting_from', 'per_plate', 45000, null, 150, 5000, 'bengaluru', 'basavanagudi', '{}'),
  ('dddddddd-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-000000000006', 'floral-decoration', 'sample-kalpavruksha-floral',
     'Sample Kalpavruksha Floral Decor', 'Premium floral décor for weddings and receptions.',
     'Sample listing for development. Orchid and rose installations, entrance arches and stage décor.',
     'request', 'range', 'per_event', 5000000, 20000000, null, null, 'bengaluru', 'jayanagar', '{"themes":["floral","contemporary"]}'),
  ('dddddddd-0000-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-000000000007', 'wedding-photography', 'sample-lens-and-light-wedding',
     'Sample Lens and Light Wedding Photography', 'Candid and traditional wedding photography with album.',
     'Sample listing for development. Two photographers, one videographer and a 40-page album.',
     'request', 'starting_from', 'per_event', 7500000, null, null, null, 'bengaluru', 'indiranagar', '{}')
) as v(id, org, svc, slug, title, summary, descr, mode, ptype, punit, base, maxp, ming, maxg, city, area, attrs)
join public.service_categories sc on sc.slug = v.svc
join public.cities c on c.slug = v.city
left join public.areas a on a.city_id = c.id and a.slug = v.area
join public.organizations o on o.id = v.org::uuid
on conflict (id) do nothing;

insert into public.venue_details (service_id, organization_id, seated_capacity, floating_capacity, dining_capacity, rooms, parking_cars, air_conditioned, catering_policy, decor_policy, alcohol_allowed)
values
  ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 800, 1200, 400, 4, 60, false, 'both', 'outside_allowed', false),
  ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 120, 150, 80, 1, 15, true, 'both', 'both', false),
  ('dddddddd-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000004', 1500, 2500, 800, 6, 250, true, 'in_house_only', 'both', false)
on conflict (service_id) do nothing;

insert into public.catering_details (service_id, organization_id, veg_price_per_plate_paise, nonveg_price_per_plate_paise, cuisines, min_plates, max_plates, live_counters, service_staff_included)
values
  ('dddddddd-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 25000, null, '{North Karnataka,South Indian}', 100, 3000, false, true),
  ('dddddddd-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000005', 45000, 65000, '{South Indian,Karnataka}', 150, 5000, true, true)
on conflict (service_id) do nothing;

-- ---------- budget estimator ranges: DEV SAMPLES (not real market data) ------
insert into public.budget_benchmarks (business_category_id, city_id, unit, low_paise, high_paise, notes, source, is_published)
select bc.id, c.id, v.unit::public.budget_unit, v.low, v.high, 'DEV SAMPLE – not real market data', 'dev seed', true
from (values
  ('venues',      'kalaburagi', 'per_event',  5000000,   30000000),
  ('catering',    'kalaburagi', 'per_guest',    20000,      50000),
  ('decoration',  'kalaburagi', 'per_event',  2000000,   15000000),
  ('photography', 'kalaburagi', 'per_event',  2500000,   15000000),
  ('makeup',      'kalaburagi', 'per_event',   800000,    4000000),
  ('mehendi',     'kalaburagi', 'per_event',   300000,    1500000),
  ('venues',      'bengaluru',  'per_event', 15000000,  100000000),
  ('catering',    'bengaluru',  'per_guest',    40000,     120000),
  ('decoration',  'bengaluru',  'per_event',  5000000,   50000000),
  ('photography', 'bengaluru',  'per_event',  7500000,   40000000),
  ('makeup',      'bengaluru',  'per_event',  2000000,   10000000),
  ('mehendi',     'bengaluru',  'per_event',   800000,    4000000)
) as v(cat, city, unit, low, high)
join public.business_categories bc on bc.slug = v.cat
join public.cities c on c.slug = v.city
on conflict (business_category_id, city_id) do nothing;

-- ---------- bookable resources for the sample venues (Phase 4 availability) ----
insert into public.bookable_resources (id, organization_id, kind, name, service_id, setup_buffer_min, breakdown_buffer_min)
values
  ('eeeeeeee-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'venue_space', 'Lakshmi main hall', 'dddddddd-0000-4000-8000-000000000001', 120, 120),
  ('eeeeeeee-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'venue_space', 'Lakshmi mini hall', 'dddddddd-0000-4000-8000-000000000002', 60, 60),
  ('eeeeeeee-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000004', 'venue_space', 'Royal Palace grand hall', 'dddddddd-0000-4000-8000-000000000005', 180, 180)
on conflict (id) do nothing;
