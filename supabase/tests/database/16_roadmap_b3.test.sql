-- Roadmap Phase B batch 3a: verified reviews (C7), support desk (C10/S2),
-- balance due date + reminders and review requests (C8).
begin;
\ir 00_helpers.sql.inc

select plan(38);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to anon, authenticated;

insert into ctx values ('owner', tests.create_user('b3-owner@example.test', 'Hall Owner'));
insert into ctx values ('cust',  tests.create_user('b3-cust@example.test', 'Asha Rao'));
insert into ctx values ('eve',   tests.create_user('b3-eve@example.test', 'Eve Outsider'));
insert into ctx values ('agent', tests.create_user('b3-agent@example.test', 'Sunita Agent'));
select tests.grant_platform_role((select v from ctx where k = 'agent'), 'support_agent');

select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('org', public.create_organization('B3 Hall Co', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-b3-org-1'));
select tests.verify_org((select v from ctx where k = 'org'));
update public.business_profiles set description = 'Hall', contact_phone = '+919845000301' where organization_id = (select v from ctx where k = 'org');
insert into public.services (organization_id, service_category_id, slug, title, status, price_type, price_unit, base_price_paise, city_id, created_by)
values ((select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'kalyana-mantapa'), '',
        'B3 Hall', 'published', 'starting_from', 'per_day', 10000000, tests.city_id('kalaburagi'), (select v from ctx where k = 'owner'));
insert into ctx select 'svc', id from public.services where title = 'B3 Hall';
insert into public.bookable_resources (organization_id, kind, name, service_id)
values ((select v from ctx where k = 'org'), 'venue_space', 'B3 space', (select v from ctx where k = 'svc'));

-- A booking 30 days out, advance paid → confirmed.
select tests.login_as((select v from ctx where k = 'cust'));
insert into ctx values ('enq', public.create_enquiry((select v from ctx where k = 'svc'), current_date + 30, '10:00', '22:00', 300, null, 'test-b3-enq-0001'));
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('quote', public.send_quotation((select v from ctx where k = 'enq'),
  '[{"description":"Hall","quantity":1,"unit_price_paise":10000000}]'::jsonb, 0, 0, 48, null, null));
select tests.login_as((select v from ctx where k = 'cust'));
select public.respond_quotation((select v from ctx where k = 'quote'), true);
insert into ctx values ('item', public.create_booking((select v from ctx where k = 'enq'), 'test-b3-book-0001'));
select tests.login_as((select v from ctx where k = 'owner'));
select public.record_offline_payment((select v from ctx where k = 'item'), 2500000, 'upi', 'UPI-1', null, 'test-b3-pay-00001');
select tests.logout();

-- ---------- C8: balance due date, reminders, receipt link ---------------------------------
select is((select balance_due_on from public.booking_items where id = (select v from ctx where k = 'item')),
  (current_date + 27), 'the balance falls due 3 days before the event');
select is((select status::text from public.booking_items where id = (select v from ctx where k = 'item')), 'confirmed',
  'the booking is confirmed once the advance is paid');
select is((select link from public.notifications where user_id = (select v from ctx where k = 'cust') and kind = 'payment.received'
           order by created_at desc limit 1),
  '/receipts/' || (select id from public.payments where booking_item_id = (select v from ctx where k = 'item'))::text,
  'the payment message opens the receipt');

update public.booking_items set balance_due_on = (now() at time zone 'Asia/Kolkata')::date + 7
 where id = (select v from ctx where k = 'item');
select is((public.send_daily_nudges() ->> 'reminders')::int >= 1, true, 'a reminder goes out 7 days before the due date');
select is((select count(*)::int from public.notifications where user_id = (select v from ctx where k = 'cust') and kind = 'payment.reminder'), 1,
  'the customer is reminded');
select is((select (params ->> 'amount_paise')::bigint from public.notifications
           where user_id = (select v from ctx where k = 'cust') and kind = 'payment.reminder'), 7500000::bigint,
  'with the balance still owed');
select public.send_daily_nudges();
select is((select count(*)::int from public.notifications where user_id = (select v from ctx where k = 'cust') and kind = 'payment.reminder'), 1,
  'running the job again sends nothing twice');
update public.booking_items set balance_due_on = (now() at time zone 'Asia/Kolkata')::date + 1
 where id = (select v from ctx where k = 'item');
select public.send_daily_nudges();
select is((select count(*)::int from public.notifications where user_id = (select v from ctx where k = 'cust') and kind = 'payment.reminder'), 2,
  'and again 1 day before');
select tests.login_as((select v from ctx where k = 'cust'));
select is((select count(*)::int from public.payment_reminders), 2, 'the customer can see the reminders sent');
select throws_ok($$ select public.send_daily_nudges() $$, '42501', null, 'only the scheduler runs the daily job');
select tests.login_as((select v from ctx where k = 'eve'));
select is((select count(*)::int from public.payment_reminders), 0, 'others cannot');

-- ---------- C7: reviews -------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'cust'));
select throws_ok($$ select public.submit_review((select v from ctx where k = 'item'), 5, 'Lovely hall and staff') $$,
  '22023', null, 'no review before the event has taken place');
select tests.logout();
update public.booking_items set event_date = current_date - 2 where id = (select v from ctx where k = 'item');
select public.send_daily_nudges();
select is((select link from public.notifications where user_id = (select v from ctx where k = 'cust') and kind = 'review.request'),
  '/account/bookings/' || (select v from ctx where k = 'item')::text || '?review=1', 'after the event the customer is asked for a review');

select tests.login_as((select v from ctx where k = 'eve'));
select throws_ok($$ select public.submit_review((select v from ctx where k = 'item'), 1, 'Never went there, terrible') $$,
  'P0002', null, 'only the customer of the booking can review it');

select tests.login_as((select v from ctx where k = 'cust'));
select throws_ok($$ select public.submit_review((select v from ctx where k = 'item'), 6, 'Lovely hall and staff') $$,
  '22023', null, 'ratings are 1 to 5');
select throws_ok($$ select public.submit_review((select v from ctx where k = 'item'), 5, 'Lovely hall and staff',
                                                array['someone-else/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg']) $$,
  '22023', null, 'photos must be the customer''s own uploads');
insert into ctx values ('review', public.submit_review((select v from ctx where k = 'item'), 4, 'Lovely hall and helpful staff',
  array[(select v from ctx where k = 'cust')::text || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg']));
select is(public.submit_review((select v from ctx where k = 'item'), 5, 'Lovely hall and very helpful staff'),
  (select v from ctx where k = 'review'), 'the customer can edit their review (one per booking)');

select tests.login_anon();
select is((select rating from public.listing_reviews((select v from ctx where k = 'svc'))), 5::smallint, 'visitors see the review');
select is((select reviewer from public.listing_reviews((select v from ctx where k = 'svc'))), 'Asha R.',
  'with the reviewer''s first name and initial only');
select is((select total from public.listing_rating((select v from ctx where k = 'svc'))), 1, 'and the rating summary');
select throws_ok($$ select * from public.reviews $$, '42501', null, 'visitors cannot read the table directly');

select tests.login_as((select v from ctx where k = 'owner'));
select is((select count(*)::int from public.notifications where kind = 'review.new' and user_id = (select v from ctx where k = 'owner')), 1,
  'the vendor is told about the review');
select public.reply_review((select v from ctx where k = 'review'), 'Thank you, Asha!');
select tests.login_as((select v from ctx where k = 'eve'));
select throws_ok($$ select public.reply_review((select v from ctx where k = 'review'), 'Fake reply') $$, 'P0002', null,
  'others cannot reply');
select tests.login_as((select v from ctx where k = 'cust'));
select throws_ok($$ select public.submit_review((select v from ctx where k = 'item'), 1, 'Changed my mind entirely') $$,
  '22023', null, 'after the vendor replies the review is fixed');

select tests.login_as((select v from ctx where k = 'owner'));
select throws_ok($$ select public.set_review_status((select v from ctx where k = 'review'), 'hidden', 'Dislike') $$,
  '42501', null, 'vendors cannot hide reviews');
select tests.login_as((select v from ctx where k = 'agent'));
select public.set_review_status((select v from ctx where k = 'review'), 'hidden', 'Personal details in the text');
select tests.login_anon();
select is((select count(*)::int from public.listing_reviews((select v from ctx where k = 'svc'))), 0,
  'a hidden review disappears from the listing');

-- ---------- C10 / S2: support desk ----------------------------------------------------------
select tests.login_as((select v from ctx where k = 'eve'));
select throws_ok($$ select public.open_support_ticket((select v from ctx where k = 'item'), 'problem', 'Something went wrong', 'test-b3-tk-eve01') $$,
  'P0002', null, 'nobody opens a ticket on someone else''s booking');

select tests.login_as((select v from ctx where k = 'cust'));
insert into ctx values ('ticket', public.open_support_ticket((select v from ctx where k = 'item'), 'vendor_not_responding',
                                                           'The hall manager is not answering calls.', 'test-b3-tk-00001'));
select is(public.open_support_ticket((select v from ctx where k = 'item'), 'vendor_not_responding',
                                     'The hall manager is not answering calls.', 'test-b3-tk-00001'),
  (select v from ctx where k = 'ticket'), 'a double tap opens one ticket');
select is((select sla_due_at - created_at from public.support_tickets where id = (select v from ctx where k = 'ticket')),
  interval '4 hours', '"vendor not responding" gets a 4-hour reply target');
select is((select organization_id from public.support_tickets where id = (select v from ctx where k = 'ticket')),
  (select v from ctx where k = 'org'), 'the ticket is linked to the booking''s vendor');

select tests.login_as((select v from ctx where k = 'agent'));
select is((select count(*)::int from public.support_tickets where id = (select v from ctx where k = 'ticket')), 1,
  'the ticket appears in the support desk');
select is((public.support_ticket_context((select v from ctx where k = 'ticket')) -> 'booking' ->> 'paid_paise')::bigint, 2500000::bigint,
  'with the booking and its payments on one screen');
select public.post_support_message((select v from ctx where k = 'ticket'), 'Called the vendor, waiting to hear.', true);
select public.post_support_message((select v from ctx where k = 'ticket'), 'We have reached the vendor; they will call you today.');
select is((select status from public.support_tickets where id = (select v from ctx where k = 'ticket')), 'waiting_customer',
  'a reply moves the ticket to waiting for the customer');
select public.update_support_ticket((select v from ctx where k = 'ticket'), 'resolved', 'normal', (select v from ctx where k = 'agent'));

select tests.login_as((select v from ctx where k = 'cust'));
select is((select count(*)::int from public.support_messages where ticket_id = (select v from ctx where k = 'ticket')), 2,
  'the customer sees the conversation but not internal notes');
select is((select count(*)::int from public.notifications where user_id = (select v from ctx where k = 'cust') and kind like 'support.%'), 2,
  'and is told about the reply and the resolution');
select public.post_support_message((select v from ctx where k = 'ticket'), 'They still have not called.');
select is((select status from public.support_tickets where id = (select v from ctx where k = 'ticket')), 'open',
  'a customer reply reopens a resolved ticket');
select throws_ok($$ select public.update_support_ticket((select v from ctx where k = 'ticket'), 'closed', 'normal', null) $$,
  '42501', null, 'customers cannot change the ticket status');

select tests.logout();
select is((select count(*)::int from public.audit_logs where entity_table = 'support_tickets'
           and entity_id = (select v from ctx where k = 'ticket')::text and 'status' = any(changed_fields)) >= 2, true,
  'status changes are in the audit log');

select * from finish();
rollback;
