-- QA retest fixes (15 Nov 2026): B12 date check uses the event hours.
begin;
\ir 00_helpers.sql.inc

select plan(6);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to anon, authenticated;

insert into ctx values ('owner', tests.create_user('qa-owner@example.test', 'Qa Owner'));
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('org', public.create_organization('Qa Hall Co', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-qa-001'));
select tests.logout();
update public.organizations set verification_status = 'verified', verified_at = now() where id = (select v from ctx where k = 'org');
update public.business_profiles set description = 'Test hall', contact_phone = '+919845000009' where organization_id = (select v from ctx where k = 'org');
insert into public.services (id, organization_id, service_category_id, title, status, price_type, price_unit, base_price_paise, city_id, created_by)
values (extensions.gen_random_uuid(), (select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'kalyana-mantapa'),
        'Qa Main Hall', 'published', 'starting_from', 'per_day', 10000000, tests.city_id('kalaburagi'), (select v from ctx where k = 'owner'));
insert into ctx select 'svc', id from public.services where organization_id = (select v from ctx where k = 'org');
-- The QA setup: 120 min setup and 60 min breakdown buffers.
insert into public.bookable_resources (organization_id, kind, name, service_id, setup_buffer_min, breakdown_buffer_min)
values ((select v from ctx where k = 'org'), 'venue_space', 'Qa Main Hall', (select v from ctx where k = 'svc'), 120, 60);
insert into ctx select 'res', id from public.bookable_resources where service_id = (select v from ctx where k = 'svc');

-- A confirmed booking on 22 Dec 2027, 10:00–22:00 IST (blocked 08:00–23:00 with buffers).
insert into public.resource_reservations (resource_id, organization_id, period, status, source)
values ((select v from ctx where k = 'res'), (select v from ctx where k = 'org'),
        tstzrange('2027-12-22 10:00+05:30', '2027-12-22 22:00+05:30', '[)'), 'blocked', 'manual_block');

select is((select status from public.listing_availability((select v from ctx where k = 'svc'), '2027-12-22', '2027-12-22')),
  'unavailable', 'the booked day is unavailable');
select is((select status from public.listing_availability((select v from ctx where k = 'svc'), '2027-12-23', '2027-12-23')),
  'available', 'the day after is available for a normal 10:00–22:00 event (QA B12)');
select is((select status from public.listing_availability((select v from ctx where k = 'svc'), '2027-12-21', '2027-12-21')),
  'available', 'the day before is available');
select is((select status from public.listing_availability((select v from ctx where k = 'svc'), '2027-12-23', '2027-12-23', '00:00', '02:00')),
  'unavailable', 'an early start that runs into the breakdown buffer is still refused');
select is((select status from public.listing_availability((select v from ctx where k = 'svc'), '2027-12-22', '2027-12-22', '23:30', '23:45')),
  'unavailable', 'a late slot on the booked day that falls in the breakdown buffer is refused');
select throws_ok($$ select * from public.listing_availability((select v from ctx where k = 'svc'), '2027-12-23', '2027-12-23', '22:00', '10:00') $$,
  '22023', null, 'the end time must be after the start time');

select * from finish();
rollback;
