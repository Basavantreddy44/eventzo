-- Phase 5: bookings, advance payments (online + offline), cancellation & refunds, expiry.
begin;
\ir 00_helpers.sql.inc

select plan(48);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to anon, authenticated;
create temp table d (k text primary key, v date) on commit drop;
grant all on d to anon, authenticated;
insert into d values ('d1', current_date + 40), ('d2', current_date + 10), ('d3', current_date + 45), ('d4', current_date + 3);

insert into ctx values ('owner', tests.create_user('bk-owner@example.test', 'Bk Owner'));
insert into ctx values ('alice', tests.create_user('bk-alice@example.test', 'Alice Booker'));
insert into ctx values ('bob',   tests.create_user('bk-bob@example.test', 'Bob Booker'));
insert into ctx values ('eve',   tests.create_user('bk-eve@example.test', 'Eve Outsider'));
insert into ctx values ('fin',   tests.create_user('bk-fin@example.test', 'Finance Operator'));
select tests.grant_platform_role((select v from ctx where k = 'fin'), 'finance_operator');

-- vendor: a request-to-book hall (default 25% advance, moderate policy) with a
-- linked resource, and an instant room (50% advance, flexible policy).
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('org', public.create_organization('Tau Test Mantapa', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-tau-0001'));
update public.business_profiles set description = 'Test hall', contact_phone = '+919845000000' where organization_id = (select v from ctx where k = 'org');
insert into public.services (organization_id, service_category_id, slug, title, status, price_type, price_unit, base_price_paise, city_id, created_by)
values ((select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'kalyana-mantapa'), '',
        'Tau Hall', 'published', 'starting_from', 'per_day', 10000000, tests.city_id('kalaburagi'), (select v from ctx where k = 'owner'));
insert into ctx select 'svc', id from public.services where title = 'Tau Hall';
insert into public.services (organization_id, service_category_id, slug, title, status, booking_mode, price_type, price_unit,
                             base_price_paise, city_id, advance_bps, cancellation_policy, created_by)
values ((select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'banquet-hall'), '',
        'Tau Instant Room', 'published', 'instant', 'fixed', 'per_day', 2000000, tests.city_id('kalaburagi'), 5000, 'flexible',
        (select v from ctx where k = 'owner'));
insert into ctx select 'svc_instant', id from public.services where title = 'Tau Instant Room';
insert into public.bookable_resources (organization_id, kind, name, service_id)
values ((select v from ctx where k = 'org'), 'venue_space', 'Tau hall space', (select v from ctx where k = 'svc'));

-- ---------- quote → booking --------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'alice'));
insert into ctx values ('enq', public.create_enquiry((select v from ctx where k = 'svc'), (select v from d where k = 'd1'), '10:00', '22:00', 300, null, 'test-bk-alice-0001'));
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('quote', public.send_quotation((select v from ctx where k = 'enq'),
  '[{"description":"Hall for the day","quantity":1,"unit_price_paise":10000000}]'::jsonb, 0, 0, 48, null, 'Moderate policy'));
select tests.login_as((select v from ctx where k = 'alice'));
select public.respond_quotation((select v from ctx where k = 'quote'), true);

select is((select advance_paise from public.booking_preview((select v from ctx where k = 'enq'))), 2500000::bigint,
  'the preview shows a 25% advance of the accepted quote');
insert into ctx values ('item', public.create_booking((select v from ctx where k = 'enq'), 'test-bk-book-0001'));
select is(public.create_booking((select v from ctx where k = 'enq'), 'test-bk-book-0002'), (select v from ctx where k = 'item'),
  'booking the same enquiry again returns the same booking');
select is((select status::text from public.enquiries where id = (select v from ctx where k = 'enq')), 'booked', 'the enquiry becomes booked');
select results_eq(
  $$ select status::text, total_paise, advance_paise, paid_paise, cancellation_policy::text
     from public.booking_items where id = (select v from ctx where k = 'item') $$,
  $$ values ('pending_payment', 10000000::bigint, 2500000::bigint, 0::bigint, 'moderate') $$,
  'the booking waits for the advance, with total, advance and policy snapshotted');
select is((select jsonb_array_length(snapshot -> 'quotation' -> 'items') from public.booking_items where id = (select v from ctx where k = 'item')), 1,
  'the accepted quote lines are snapshotted onto the booking');
select throws_ok($$ insert into public.booking_items (booking_id, enquiry_id, customer_id, organization_id, service_id, event_date, period,
                      total_paise, advance_bps, advance_paise, cancellation_policy, payment_due_at)
                    select b.booking_id, b.enquiry_id, b.customer_id, b.organization_id, b.service_id, b.event_date, b.period,
                           1, 1000, 1, 'flexible', now() from public.booking_items b limit 1 $$,
  '42501', null, 'booking items cannot be inserted directly');

select tests.login_as((select v from ctx where k = 'bob'));
select is_empty($$ select 1 from public.booking_items where id = (select v from ctx where k = 'item') $$, 'customers cannot see each other''s bookings');
select throws_ok($$ select * from public.start_payment((select v from ctx where k = 'item')) $$, 'P0002', null, 'another customer cannot pay for the booking');
select throws_ok($$ select public.create_booking((select v from ctx where k = 'enq'), 'test-bk-bob-00001') $$, 'P0002', null, 'another customer cannot book the enquiry');

select tests.login_anon();
select throws_ok($$ select public.create_booking((select v from ctx where k = 'enq'), 'test-bk-anon-0001') $$, '42501', null, 'anonymous visitors cannot book');

-- ---------- online advance (Razorpay) ------------------------------------------------------
select tests.login_as((select v from ctx where k = 'alice'));
insert into ctx select 'pay', payment_id from public.start_payment((select v from ctx where k = 'item'));
select results_eq($$ select amount_paise, kind from public.start_payment((select v from ctx where k = 'item')) $$,
  $$ values (2500000::bigint, 'advance') $$, 'the first online payment is the advance');
select is((select payment_id from public.start_payment((select v from ctx where k = 'item'))), (select v from ctx where k = 'pay'),
  'retrying reuses the unpaid payment');
select throws_ok($$ select public.attach_payment_order((select v from ctx where k = 'pay'), 'order_fake') $$, '42501', null,
  'customers cannot attach gateway orders');
select throws_ok($$ select public.confirm_online_payment('order_test_1', 'pay_fake', 2500000) $$, '42501', null,
  'customers cannot mark payments as paid');

select tests.logout();   -- service role path (verified checkout callback / webhook)
select public.attach_payment_order((select v from ctx where k = 'pay'), 'order_test_1');
select throws_ok($$ select public.confirm_online_payment('order_test_1', 'pay_test_1', 100) $$, '22023', null,
  'a captured amount that differs from the order is refused');
select lives_ok($$ select public.confirm_online_payment('order_test_1', 'pay_test_1', 2500000) $$, 'the captured advance is applied');
select lives_ok($$ select public.confirm_online_payment('order_test_1', 'pay_test_1', 2500000) $$, 'a duplicate confirmation is a no-op');
select results_eq($$ select status::text, paid_paise from public.booking_items where id = (select v from ctx where k = 'item') $$,
  $$ values ('confirmed', 2500000::bigint) $$, 'paying the advance confirms the booking (counted once)');
select results_eq($$ select rr.status::text, rr.hold_expires_at is null, rr.booking_item_id = (select v from ctx where k = 'item')
                     from public.resource_reservations rr join public.booking_items b on b.reservation_id = rr.id
                     where b.id = (select v from ctx where k = 'item') $$,
  $$ values ('confirmed', true, true) $$, 'the date hold becomes a confirmed reservation');

-- ---------- balance: online or offline ----------------------------------------------------
select tests.login_as((select v from ctx where k = 'alice'));
select results_eq($$ select amount_paise, kind from public.start_payment((select v from ctx where k = 'item')) $$,
  $$ values (7500000::bigint, 'balance') $$, 'after the advance, online payment asks for the balance');

select tests.login_as((select v from ctx where k = 'eve'));
select throws_ok($$ select public.record_offline_payment((select v from ctx where k = 'item'), 100, 'cash', null, null, 'test-bk-eve-00001') $$,
  'P0002', null, 'outsiders cannot record payments');
select tests.login_as((select v from ctx where k = 'owner'));
select throws_ok($$ select public.record_offline_payment((select v from ctx where k = 'item'), 7500001, 'upi', null, null, 'test-bk-off-00001') $$,
  '22023', null, 'an offline payment cannot exceed the balance');
insert into ctx values ('offpay', public.record_offline_payment((select v from ctx where k = 'item'), 7500000, 'upi', 'UPI-REF-1', 'Paid at office', 'test-bk-off-00002'));
select is(public.record_offline_payment((select v from ctx where k = 'item'), 7500000, 'upi', 'UPI-REF-1', null, 'test-bk-off-00002'),
  (select v from ctx where k = 'offpay'), 'recording the same offline payment twice is idempotent');
select is((select paid_paise from public.booking_items where id = (select v from ctx where k = 'item')), 10000000::bigint,
  'the vendor records the balance received by UPI');
select tests.logout();
select isnt_empty($$ select 1 from public.audit_logs where entity_table = 'payments' and entity_id = (select v from ctx where k = 'offpay')::text $$,
  'offline payments are audited');

-- ---------- cancellation (customer, moderate policy, 40 days ahead) --------------------------
select tests.login_as((select v from ctx where k = 'alice'));
select results_eq($$ select refund_paise, refund_bps from public.cancellation_quote((select v from ctx where k = 'item')) $$,
  $$ values (10000000::bigint, 10000) $$, 'moderate policy: 30+ days before → full refund');
select is(public.cancel_booking_item((select v from ctx where k = 'item'), 'Change of plans'), 10000000::bigint, 'the customer cancels');
select results_eq($$ select method::text, amount_paise, status::text from public.refunds where booking_item_id = (select v from ctx where k = 'item') order by amount_paise $$,
  $$ values ('razorpay', 2500000::bigint, 'pending'), ('offline', 7500000::bigint, 'pending') $$,
  'refunds are queued per payment (online and offline)');
select tests.login_anon();
select is((select status from public.listing_availability((select v from ctx where k = 'svc'), (select v from d where k = 'd1'), (select v from d where k = 'd1'))),
  'available', 'cancelling frees the date');

-- ---------- issuing refunds -----------------------------------------------------------------
select tests.logout();
insert into ctx select 'rf_online', id from public.refunds where method = 'razorpay' and booking_item_id = (select v from ctx where k = 'item');
insert into ctx select 'rf_offline', id from public.refunds where method = 'offline' and booking_item_id = (select v from ctx where k = 'item');
select tests.login_as((select v from ctx where k = 'eve'));
select throws_ok($$ select * from public.begin_refund((select v from ctx where k = 'rf_offline')) $$, 'P0002', null, 'outsiders cannot issue refunds');
select tests.login_as((select v from ctx where k = 'owner'));
select throws_ok($$ select * from public.begin_refund((select v from ctx where k = 'rf_online')) $$, 'P0002', null,
  'vendors cannot issue online refunds (finance does)');
select lives_ok($$ select * from public.begin_refund((select v from ctx where k = 'rf_offline')) $$, 'the vendor starts the offline refund');
select throws_ok($$ select public.complete_refund((select v from ctx where k = 'rf_offline'), true, '') $$, '22023', null,
  'an offline refund needs a reference');
select public.complete_refund((select v from ctx where k = 'rf_offline'), true, 'UPI-RF-1');
select is((select status::text from public.refunds where id = (select v from ctx where k = 'rf_offline')), 'processed', 'the offline refund is recorded');

select tests.login_as((select v from ctx where k = 'fin'));
select isnt_empty($$ select 1 from public.booking_items where id = (select v from ctx where k = 'item') $$, 'finance can read bookings');
select is((select razorpay_payment_id from public.begin_refund((select v from ctx where k = 'rf_online'))), 'pay_test_1',
  'finance starts the online refund against the captured payment');
select public.complete_refund((select v from ctx where k = 'rf_online'), true, 'rfnd_test_1');
select results_eq($$ select status::text, razorpay_refund_id from public.refunds where id = (select v from ctx where k = 'rf_online') $$,
  $$ values ('processed', 'rfnd_test_1') $$, 'the online refund is recorded with the gateway id');

-- ---------- instant booking, snapshot, vendor cancellation --------------------------------
select tests.login_as((select v from ctx where k = 'bob'));
insert into ctx values ('enq_i', public.create_enquiry((select v from ctx where k = 'svc_instant'), (select v from d where k = 'd2'), '10:00', '14:00', 40, null, 'test-bk-bob-00002'));
insert into ctx values ('item_i', public.create_booking((select v from ctx where k = 'enq_i'), 'test-bk-book-0003'));
select tests.login_as((select v from ctx where k = 'owner'));
update public.services set advance_bps = 1000, cancellation_policy = 'strict' where id = (select v from ctx where k = 'svc_instant');
select results_eq($$ select total_paise, advance_paise, cancellation_policy::text from public.booking_items where id = (select v from ctx where k = 'item_i') $$,
  $$ values (2000000::bigint, 1000000::bigint, 'flexible') $$,
  'instant booking uses the listed price; later listing edits do not change the booking');
select public.record_offline_payment((select v from ctx where k = 'item_i'), 1000000, 'cash', null, null, 'test-bk-off-00003');
select is((select status::text from public.booking_items where id = (select v from ctx where k = 'item_i')), 'confirmed',
  'an advance received in cash confirms the booking');
select throws_ok($$ select public.cancel_booking_item((select v from ctx where k = 'item_i'), '  ') $$, '22023', null,
  'a vendor must give a reason to cancel');
select is(public.cancel_booking_item((select v from ctx where k = 'item_i'), 'Hall under repair'), 1000000::bigint,
  'a vendor cancellation refunds everything paid');

-- ---------- short-notice customer cancellation: no refund ------------------------------------
select tests.login_as((select v from ctx where k = 'alice'));
insert into ctx values ('enq_s', public.create_enquiry((select v from ctx where k = 'svc'), (select v from d where k = 'd4'), '10:00', '22:00', 100, null, 'test-bk-alice-0002'));
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('quote_s', public.send_quotation((select v from ctx where k = 'enq_s'), '[{"description":"Hall","quantity":1,"unit_price_paise":4000000}]', 0, 0, 48, null, null));
select tests.login_as((select v from ctx where k = 'alice'));
select public.respond_quotation((select v from ctx where k = 'quote_s'), true);
insert into ctx values ('item_s', public.create_booking((select v from ctx where k = 'enq_s'), 'test-bk-book-0004'));
select tests.login_as((select v from ctx where k = 'owner'));
select public.record_offline_payment((select v from ctx where k = 'item_s'), 1000000, 'cash', null, null, 'test-bk-off-00004');
select tests.login_as((select v from ctx where k = 'alice'));
select is(public.cancel_booking_item((select v from ctx where k = 'item_s'), null), 0::bigint,
  'moderate policy: under 7 days before → no refund');
select is_empty($$ select 1 from public.refunds where booking_item_id = (select v from ctx where k = 'item_s') $$, 'no refund is queued');

-- ---------- unpaid bookings expire with the hold ------------------------------------------------
insert into ctx values ('enq_x', public.create_enquiry((select v from ctx where k = 'svc'), (select v from d where k = 'd3'), '10:00', '22:00', 100, null, 'test-bk-alice-0003'));
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('quote_x', public.send_quotation((select v from ctx where k = 'enq_x'), '[{"description":"Hall","quantity":1,"unit_price_paise":5000000}]', 0, 0, 48, null, null));
select tests.login_as((select v from ctx where k = 'alice'));
select public.respond_quotation((select v from ctx where k = 'quote_x'), true);
insert into ctx values ('item_x', public.create_booking((select v from ctx where k = 'enq_x'), 'test-bk-book-0005'));
insert into ctx select 'pay_x', payment_id from public.start_payment((select v from ctx where k = 'item_x'));
select tests.logout();
select public.attach_payment_order((select v from ctx where k = 'pay_x'), 'order_late_1');
update public.resource_reservations set hold_expires_at = now() - interval '1 minute'
 where booking_item_id = (select v from ctx where k = 'item_x');
update public.booking_items set payment_due_at = now() - interval '1 minute' where id = (select v from ctx where k = 'item_x');
select public.release_expired_holds();
select is((select status::text from public.booking_items where id = (select v from ctx where k = 'item_x')), 'expired',
  'an unpaid booking expires when the 48-hour hold runs out');
select is((select status::text from public.enquiries where id = (select v from ctx where k = 'enq_x')), 'expired', 'its enquiry shows expired');
select tests.login_as((select v from ctx where k = 'alice'));
select throws_ok($$ select * from public.start_payment((select v from ctx where k = 'item_x')) $$, '22023', null, 'expired bookings cannot be paid');
select tests.logout();
select public.confirm_online_payment('order_late_1', 'pay_late_1', 1250000);
select is((select sum(amount_paise) from public.refunds where booking_item_id = (select v from ctx where k = 'item_x')), 1250000::numeric,
  'a payment that lands after expiry is queued for a full refund');

-- ---------- webhook log is service-role only ------------------------------------------------
select tests.login_as((select v from ctx where k = 'fin'));
select throws_ok($$ insert into public.payment_webhook_events (event_id, event_type, payload) values ('evt_1', 'x', '{}') $$,
  '42501', null, 'nobody but the service role writes the webhook log');

select * from finish();
rollback;
