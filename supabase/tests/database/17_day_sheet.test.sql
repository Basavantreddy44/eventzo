-- Roadmap Phase B batch 3b: event day sheet (C9).
begin;
\ir 00_helpers.sql.inc

select plan(9);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to anon, authenticated;

insert into ctx values ('owner',  tests.create_user('ds-owner@example.test', 'Hall Owner'));
insert into ctx values ('cust',   tests.create_user('ds-cust@example.test', 'Asha Rao'));
insert into ctx values ('cohost', tests.create_user('ds-cohost@example.test', 'Ravi Rao'));
insert into ctx values ('eve',    tests.create_user('ds-eve@example.test', 'Eve Outsider'));

select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('org', public.create_organization('DS Hall Co', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-ds-org-1'));
select tests.verify_org((select v from ctx where k = 'org'));
update public.business_profiles set description = 'Hall', contact_phone = '+919845000401', whatsapp_phone = '+919845000402'
 where organization_id = (select v from ctx where k = 'org');
insert into public.services (organization_id, service_category_id, slug, title, status, price_type, price_unit, base_price_paise, city_id, created_by)
values ((select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'kalyana-mantapa'), '',
        'DS Hall', 'published', 'starting_from', 'per_day', 10000000, tests.city_id('kalaburagi'), (select v from ctx where k = 'owner'));
insert into ctx select 'svc', id from public.services where title = 'DS Hall';
insert into public.bookable_resources (organization_id, kind, name, service_id, setup_buffer_min)
values ((select v from ctx where k = 'org'), 'venue_space', 'DS space', (select v from ctx where k = 'svc'), 120);

-- The customer's event with a co-host; an enquiry booked under it.
select tests.login_as((select v from ctx where k = 'cust'));
insert into ctx values ('event', public.create_event('Asha weds Ravi', 'wedding', tests.city_id('kalaburagi'),
                                                    current_date + 40, null, 300, 'test-ds-event-0001'));
insert into ctx values ('enq', public.create_enquiry((select v from ctx where k = 'svc'), current_date + 40, '10:00', '22:00', 300, null, 'test-ds-enq-0001'));
select public.set_enquiry_event((select v from ctx where k = 'enq'), (select v from ctx where k = 'event'));
select tests.logout();
insert into public.event_members (event_id, user_id, role)
values ((select v from ctx where k = 'event'), (select v from ctx where k = 'cohost'), 'cohost');

select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('quote', public.send_quotation((select v from ctx where k = 'enq'),
  '[{"description":"Hall","quantity":1,"unit_price_paise":10000000}]'::jsonb, 0, 0, 48, null, null));
select tests.login_as((select v from ctx where k = 'cust'));
select public.respond_quotation((select v from ctx where k = 'quote'), true);
insert into ctx values ('item', public.create_booking((select v from ctx where k = 'enq'), 'test-ds-book-0001'));

select is((select count(*)::int from public.event_day_sheet((select v from ctx where k = 'event'))), 0,
  'a booking waiting for the advance is not on the day sheet (no phone numbers yet)');

select tests.login_as((select v from ctx where k = 'owner'));
select public.record_offline_payment((select v from ctx where k = 'item'), 2500000, 'upi', 'UPI-1', null, 'test-ds-pay-00001');

select tests.login_as((select v from ctx where k = 'cust'));
select is((select listing_title from public.event_day_sheet((select v from ctx where k = 'event'))), 'DS Hall',
  'once confirmed, the vendor appears');
select is((select arrival_at from public.event_day_sheet((select v from ctx where k = 'event'))),
  ((current_date + 40) + time '08:00') at time zone 'Asia/Kolkata',
  'arrival = start of the setup window (2 hours before 10:00)');
select is((select contact_phone from public.event_day_sheet((select v from ctx where k = 'event'))), '+919845000402',
  'without assigned staff, the business WhatsApp number is the contact');

-- The vendor assigns Ravi with a call time: he becomes the contact.
select tests.login_as((select v from ctx where k = 'owner'));
insert into public.staff_profiles (organization_id, full_name, phone, skill, created_by)
values ((select v from ctx where k = 'org'), 'Ravi Manager', '+919845000499', 'Hall manager', (select v from ctx where k = 'owner'));
select public.assign_staff(public.ensure_job((select v from ctx where k = 'item'), null),
                           (select id from public.staff_profiles where full_name = 'Ravi Manager'),
                           'Hall manager', ((current_date + 40) + time '07:30') at time zone 'Asia/Kolkata', null);

select tests.login_as((select v from ctx where k = 'cohost'));
select is((select contact_name || ' · ' || contact_role from public.event_day_sheet((select v from ctx where k = 'event'))),
  'Ravi Manager · Hall manager', 'co-hosts see the assigned staff member as the contact');
select is((select contact_phone from public.event_day_sheet((select v from ctx where k = 'event'))), '+919845000499',
  'with their phone');
select is((select arrival_at from public.event_day_sheet((select v from ctx where k = 'event'))),
  ((current_date + 40) + time '07:30') at time zone 'Asia/Kolkata', 'and their call time as the arrival');

select tests.login_as((select v from ctx where k = 'eve'));
select throws_ok($$ select * from public.event_day_sheet((select v from ctx where k = 'event')) $$,
  'P0002', null, 'people outside the event cannot see it');
select tests.login_anon();
select throws_ok($$ select * from public.event_day_sheet((select v from ctx where k = 'event')) $$,
  '42501', null, 'nor can visitors');

select * from finish();
rollback;
