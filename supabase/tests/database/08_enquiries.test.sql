-- Phase 4: enquiries hold dates for 48h, quotations, availability, offline bookings.
begin;
\ir 00_helpers.sql.inc

select plan(32);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to anon, authenticated;
create temp table d (k text primary key, v date) on commit drop;
grant all on d to anon, authenticated;
insert into d values ('d1', current_date + 40), ('d2', current_date + 41), ('d3', current_date + 42), ('d4', current_date + 43);

insert into ctx values ('owner', tests.create_user('enq-owner@example.test', 'Enq Owner'));
insert into ctx values ('alice', tests.create_user('enq-alice@example.test', 'Alice Customer'));
insert into ctx values ('bob',   tests.create_user('enq-bob@example.test', 'Bob Customer'));
insert into ctx values ('eve',   tests.create_user('enq-eve@example.test', 'Eve Outsider'));
update public.profiles set phone = '+919845011111' where id = (select v from ctx where k = 'alice');

-- vendor with a published listing linked to one exclusive hall
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('org', public.create_organization('Sigma Test Mantapa', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-sigma-001'));
update public.business_profiles set description = 'Test hall', contact_phone = '+919845000000' where organization_id = (select v from ctx where k = 'org');
insert into public.services (organization_id, service_category_id, slug, title, status, price_type, price_unit, base_price_paise, city_id, max_guests, created_by)
values ((select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'kalyana-mantapa'), '',
        'Sigma Hall', 'published', 'starting_from', 'per_day', 10000000, tests.city_id('kalaburagi'), 500, (select v from ctx where k = 'owner'));
insert into ctx select 'svc', id from public.services where title = 'Sigma Hall';
insert into public.services (organization_id, service_category_id, slug, title, status, booking_mode, price_type, price_unit, base_price_paise, city_id, created_by)
values ((select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'banquet-hall'), '',
        'Sigma Instant Room', 'published', 'instant', 'fixed', 'per_day', 2000000, tests.city_id('kalaburagi'), (select v from ctx where k = 'owner'));
insert into ctx select 'svc_instant', id from public.services where title = 'Sigma Instant Room';
insert into public.bookable_resources (organization_id, kind, name, service_id)
values ((select v from ctx where k = 'org'), 'venue_space', 'Sigma hall space', (select v from ctx where k = 'svc'));
insert into ctx select 'res', id from public.bookable_resources where name = 'Sigma hall space';

select is((select status::text from public.organizations where id = (select v from ctx where k = 'org')), 'active', 'the test vendor is live');

-- ---------- enquiry + 48-hour hold ------------------------------------------------------
select tests.login_as((select v from ctx where k = 'alice'));
insert into ctx values ('enq', public.create_enquiry((select v from ctx where k = 'svc'), (select v from d where k = 'd1'), '10:00', '22:00', 300, 'Wedding', 'test-enq-alice-0001'));

select is(public.create_enquiry((select v from ctx where k = 'svc'), (select v from d where k = 'd1'), '10:00', '22:00', 300, 'Wedding', 'test-enq-alice-0001'),
  (select v from ctx where k = 'enq'), 'create_enquiry is idempotent');
select is((select status::text from public.enquiries where id = (select v from ctx where k = 'enq')), 'open', 'a request-to-book enquiry starts open');
select ok((select hold_expires_at between now() + interval '47 hours 59 minutes' and now() + interval '48 hours 1 minute'
           from public.enquiries where id = (select v from ctx where k = 'enq')), 'the date is held for 48 hours');
-- (customers can't read the vendor's calendar rows, so check the link from the enquiry)
select ok((select reservation_id is not null from public.enquiries where id = (select v from ctx where k = 'enq')),
  'a hold reservation is linked to the enquiry');
select throws_ok($$ insert into public.enquiries (organization_id, service_id, customer_id, event_date, period, booking_mode)
                    values ((select v from ctx where k = 'org'), (select v from ctx where k = 'svc'), (select v from ctx where k = 'alice'),
                            current_date + 50, tstzrange(now(), now() + interval '1 hour'), 'request') $$,
  '42501', null, 'enquiries cannot be inserted directly');
select throws_ok($$ select public.create_enquiry((select v from ctx where k = 'svc'), (select v from d where k = 'd2'), '10:00', '22:00', 900, null, 'test-enq-alice-0002') $$,
  '22023', null, 'guest count above the listing maximum is refused');

select tests.login_as((select v from ctx where k = 'bob'));
select throws_ok($$ select public.create_enquiry((select v from ctx where k = 'svc'), (select v from d where k = 'd1'), '12:00', '18:00', 100, null, 'test-enq-bob-00001') $$,
  '23P01', null, 'a held date cannot be requested by another customer');
select is_empty($$ select 1 from public.enquiries where id = (select v from ctx where k = 'enq') $$, 'customers cannot see each other''s enquiries');

select tests.login_anon();
select is((select status from public.listing_availability((select v from ctx where k = 'svc'), (select v from d where k = 'd1'), (select v from d where k = 'd1'))),
  'unavailable', 'public availability shows the held date as unavailable');
select is((select status from public.listing_availability((select v from ctx where k = 'svc'), (select v from d where k = 'd2'), (select v from d where k = 'd2'))),
  'available', 'other dates stay available');
select is((select status from public.listing_availability((select v from ctx where k = 'svc_instant'), (select v from d where k = 'd2'), (select v from d where k = 'd2'))),
  'unknown', 'listings without linked resources report unknown availability');

-- ---------- vendor side --------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'owner'));
select isnt_empty($$ select 1 from public.enquiries where id = (select v from ctx where k = 'enq') $$, 'the vendor sees the enquiry');
select ok((select phone is null and email is null from public.enquiry_contact((select v from ctx where k = 'enq'))),
  'customer phone and email stay hidden before the customer commits');
select throws_ok($$ select public.release_reservation((select reservation_id from public.enquiries where id = (select v from ctx where k = 'enq'))) $$,
  '42501', null, 'an enquiry hold cannot be silently released from the calendar');
select throws_ok($$ select public.create_enquiry((select v from ctx where k = 'svc'), (select v from d where k = 'd3'), '10:00', '12:00', 10, null, 'test-enq-owner-001') $$,
  '42501', null, 'a vendor cannot enquire with their own business');

insert into ctx values ('quote', public.send_quotation((select v from ctx where k = 'enq'),
  '[{"description":"Hall for the day","quantity":1,"unit_price_paise":10000000},{"description":"Extra chairs","quantity":100,"unit_price_paise":5000}]'::jsonb,
  500000, 1800, 48, 'Includes cleaning', 'Advance is non-refundable within 30 days of the event.'));
select is((select total_paise from public.quotations where id = (select v from ctx where k = 'quote')), 11800000::bigint,
  'totals are computed in the database: (₹1,00,000 + ₹5,000 − ₹5,000 discount) + 18% tax = ₹1,18,000');
select is((select status::text from public.enquiries where id = (select v from ctx where k = 'enq')), 'quoted', 'sending a quote marks the enquiry quoted');

select tests.login_as((select v from ctx where k = 'eve'));
select throws_ok($$ select public.send_quotation((select v from ctx where k = 'enq'), '[{"description":"x","quantity":1,"unit_price_paise":1}]', 0, 0, 24, null, null) $$,
  'P0002', null, 'outsiders cannot quote');
select is_empty($$ select 1 from public.quotations where id = (select v from ctx where k = 'quote') $$, 'outsiders cannot read quotations');

select tests.login_as((select v from ctx where k = 'bob'));
select throws_ok($$ select public.respond_quotation((select v from ctx where k = 'quote'), true) $$,
  'P0002', null, 'another customer cannot accept the quote');

select tests.login_as((select v from ctx where k = 'alice'));
select is((select count(*)::int from public.quotation_items qi where qi.quotation_id = (select v from ctx where k = 'quote')), 2, 'the customer sees the quote lines');
select lives_ok($$ select public.respond_quotation((select v from ctx where k = 'quote'), true) $$, 'the customer accepts the quote');
select is((select status::text from public.enquiries where id = (select v from ctx where k = 'enq')), 'accepted', 'the enquiry is accepted');

select tests.login_as((select v from ctx where k = 'owner'));
select is((select phone from public.enquiry_contact((select v from ctx where k = 'enq'))), '+919845011111',
  'after acceptance the vendor sees the customer phone');

-- ---------- (A) offline booking blocks the date --------------------------------------------
select lives_ok($$ select public.reserve_resource((select v from ctx where k = 'res'),
  ((select v from d where k = 'd2') + time '09:00') at time zone 'Asia/Kolkata',
  ((select v from d where k = 'd2') + time '23:00') at time zone 'Asia/Kolkata', 'offline', 'confirmed') $$,
  'the vendor records an offline booking');
select tests.login_as((select v from ctx where k = 'bob'));
select throws_ok($$ select public.create_enquiry((select v from ctx where k = 'svc'), (select v from d where k = 'd2'), '10:00', '14:00', 50, null, 'test-enq-bob-00002') $$,
  '23P01', null, 'customers cannot request a date booked offline');

-- ---------- (G) instant booking -------------------------------------------------------------
insert into ctx values ('instant', public.create_enquiry((select v from ctx where k = 'svc_instant'), (select v from d where k = 'd3'), '10:00', '14:00', 50, null, 'test-enq-bob-00003'));
select is((select status::text from public.enquiries where id = (select v from ctx where k = 'instant')), 'reserved',
  'an instant-booking listing is reserved at the listed price without a quote');

-- ---------- expiry after 48 hours --------------------------------------------------------------
insert into ctx values ('enq2', public.create_enquiry((select v from ctx where k = 'svc'), (select v from d where k = 'd4'), '10:00', '22:00', 100, null, 'test-enq-bob-00004'));
select tests.logout();
update public.resource_reservations set hold_expires_at = now() - interval '1 minute'
 where id = (select reservation_id from public.enquiries where id = (select v from ctx where k = 'enq2'));
update public.enquiries set hold_expires_at = now() - interval '1 minute' where id = (select v from ctx where k = 'enq2');
select public.release_expired_holds();
select is((select status::text from public.enquiries where id = (select v from ctx where k = 'enq2')), 'expired',
  'when the 48-hour hold lapses the enquiry expires');
select is((select status from public.listing_availability((select v from ctx where k = 'svc'), (select v from d where k = 'd4'), (select v from d where k = 'd4'))),
  'available', 'and the date becomes available again');

-- ---------- cancel releases the hold ---------------------------------------------------------
select tests.login_as((select v from ctx where k = 'alice'));
select lives_ok($$ select public.cancel_enquiry((select v from ctx where k = 'enq')) $$, 'the customer can cancel');
select is((select status from public.listing_availability((select v from ctx where k = 'svc'), (select v from d where k = 'd1'), (select v from d where k = 'd1'))),
  'available', 'cancelling releases the held date');

select * from finish();
rollback;
