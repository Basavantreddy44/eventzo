-- Phase 2: public discovery shows only published services of active vendors;
-- vendors can only manage their own listings; pricing data is admin-managed.
begin;
\ir 00_helpers.sql.inc

select plan(22);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to anon, authenticated;

insert into ctx values ('owner_a', tests.create_user('listing-a@example.test'));
insert into ctx values ('owner_b', tests.create_user('listing-b@example.test'));
insert into ctx values ('admin',   tests.create_user('pricing-admin@example.test'));
select tests.grant_platform_role((select v from ctx where k = 'admin'), 'super_admin');

select tests.login_as((select v from ctx where k = 'owner_a'));
insert into ctx values ('org_a', public.create_organization('Zeta Test Mantapa', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-zeta-0001'));
select tests.login_as((select v from ctx where k = 'owner_b'));
insert into ctx values ('org_b', public.create_organization('Omega Test Caterers', tests.category_id('catering'), tests.city_id('bengaluru'), 'test-idem-omega-001'));

-- ---------- vendors create listings through RLS ---------------------------------
select tests.login_as((select v from ctx where k = 'owner_a'));
select lives_ok($$
  insert into public.services (organization_id, service_category_id, title, status, price_type, price_unit, base_price_paise, city_id, max_guests, created_by)
  values ((select v from ctx where k = 'org_a'), (select id from public.service_categories where slug = 'kalyana-mantapa'),
          'Zetaquartz Grand Mantapa', 'published', 'starting_from', 'per_day', 9000000, tests.city_id('kalaburagi'), 900,
          (select v from ctx where k = 'owner_a')) $$,
  'an owner can create a service for their organisation');
insert into ctx select 'svc_a', id from public.services where title = 'Zetaquartz Grand Mantapa';

select lives_ok($$
  insert into public.venue_details (service_id, organization_id, seated_capacity, floating_capacity)
  values ((select v from ctx where k = 'svc_a'), (select v from ctx where k = 'org_a'), 600, 900) $$,
  'an owner can add venue details to their service');

select is((select slug::text from public.services where id = (select v from ctx where k = 'svc_a')), 'zetaquartz-grand-mantapa',
  'a URL slug is generated from the title');

select throws_ok($$
  insert into public.services (organization_id, service_category_id, title, city_id, created_by)
  values ((select v from ctx where k = 'org_b'), (select id from public.service_categories where slug = 'veg-catering'),
          'Hijacked listing', tests.city_id('bengaluru'), (select v from ctx where k = 'owner_a')) $$,
  '42501', null, 'an owner cannot create a service in another organisation');

select throws_ok($$
  insert into public.services (organization_id, service_category_id, title, price_type, city_id, created_by)
  values ((select v from ctx where k = 'org_a'), (select id from public.service_categories where slug = 'kalyana-mantapa'),
          'Priced without amount', 'fixed', tests.city_id('kalaburagi'), (select v from ctx where k = 'owner_a')) $$,
  '23514', null, 'a priced listing must have an amount and unit');

select tests.login_as((select v from ctx where k = 'owner_b'));
insert into public.services (organization_id, service_category_id, title, status, price_type, price_unit, base_price_paise, city_id, created_by)
values ((select v from ctx where k = 'org_b'), (select id from public.service_categories where slug = 'veg-catering'),
        'Omegaplate Veg Feast', 'published', 'starting_from', 'per_plate', 30000, tests.city_id('bengaluru'),
        (select v from ctx where k = 'owner_b'));
insert into ctx select 'svc_b', id from public.services where title = 'Omegaplate Veg Feast';

select is_empty($$ select 1 from public.services where id = (select v from ctx where k = 'svc_a') $$,
  'vendor B cannot read vendor A''s service rows');
update public.services set title = 'Pwned' where id = (select v from ctx where k = 'svc_a');
select throws_ok($$
  insert into public.venue_details (service_id, organization_id, seated_capacity)
  values ((select v from ctx where k = 'svc_b'), (select v from ctx where k = 'org_a'), 10) $$,
  '23503', null, 'details cannot be attached across organisations');

-- ---------- public visibility -----------------------------------------------------
-- Both test orgs start as `draft`, so nothing is public yet.
select tests.login_anon();
select is_empty($$ select 1 from public.search_listings('Zetaquartz') $$, 'listings of a draft organisation are hidden');
select ok(public.get_listing('zetaquartz-grand-mantapa') is null, 'get_listing hides listings of a draft organisation');
select throws_ok($$ select 1 from public.services $$, '42501', null, 'anonymous users cannot read the services table');

select tests.logout();
update public.organizations set status = 'active' where id in ((select v from ctx where k = 'org_a'), (select v from ctx where k = 'org_b'));

select tests.login_anon();
select is((select count(*)::int from public.search_listings('Zetaquartz')), 1, 'a published listing of an active vendor is public');
select is((select title from public.search_listings('zetaquartz')), 'Zetaquartz Grand Mantapa', 'search is case-insensitive');
select is((select count(*)::int from public.search_listings('Omega Test Caterers')), 1, 'search matches the vendor name');
select is((select count(*)::int from public.search_listings('Zetaquartz', 'bengaluru')), 0, 'the city filter excludes other cities');
select is((select count(*)::int from public.search_listings('Zetaquartz', null, null, null, 950)), 0, 'the guest filter respects venue capacity');
select is((select count(*)::int from public.search_listings('Zetaquartz', null, null, null, 850)), 1, 'a venue within capacity is returned');
select is((get_listing('zetaquartz-grand-mantapa') -> 'venue' ->> 'floating_capacity')::int, 900, 'get_listing returns venue details');
select ok(not (get_listing('zetaquartz-grand-mantapa') -> 'vendor' ? 'contact_phone'), 'get_listing does not expose vendor contact details');

select tests.logout();
update public.services set status = 'paused' where id = (select v from ctx where k = 'svc_a');
select tests.login_anon();
select is_empty($$ select 1 from public.search_listings('Zetaquartz') $$, 'a paused listing disappears from search');

select tests.logout();
select is((select title from public.services where id = (select v from ctx where k = 'svc_a')), 'Zetaquartz Grand Mantapa',
  'vendor B''s update attempt changed nothing');

-- ---------- budget benchmarks ---------------------------------------------------------
select tests.login_as((select v from ctx where k = 'owner_a'));
select throws_ok($$
  insert into public.budget_benchmarks (business_category_id, city_id, unit, low_paise, high_paise)
  values (tests.category_id('gifts'), tests.city_id('kalaburagi'), 'per_event', 100, 200) $$,
  '42501', null, 'a vendor cannot edit estimator price ranges');

select tests.login_as((select v from ctx where k = 'admin'));
select lives_ok($$
  insert into public.budget_benchmarks (business_category_id, city_id, unit, low_paise, high_paise, is_published)
  values (tests.category_id('gifts'), tests.city_id('kalaburagi'), 'per_event', 100, 200, false) $$,
  'an admin with pricing.manage can add a price range');

select * from finish();
rollback;
