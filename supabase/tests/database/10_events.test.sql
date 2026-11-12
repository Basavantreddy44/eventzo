-- Phase 6: events, co-hosts, guests & RSVP links, budget lines, notifications & WhatsApp consent.
begin;
\ir 00_helpers.sql.inc

select plan(54);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to anon, authenticated;
create temp table tok (k text primary key, v text) on commit drop;
grant all on tok to anon, authenticated;

insert into ctx values ('meera',  tests.create_user('ev-meera@example.test', 'Meera Host'));
insert into ctx values ('ravi',   tests.create_user('ev-ravi@example.test', 'Ravi Cohost'));
insert into ctx values ('sita',   tests.create_user('ev-sita@example.test', 'Sita Viewer'));
insert into ctx values ('eve',    tests.create_user('ev-eve@example.test', 'Eve Outsider'));
insert into ctx values ('vendor', tests.create_user('ev-vendor@example.test', 'Vendor Owner'));

-- ---------- event creation ------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'meera'));
insert into ctx values ('event', public.create_event('Meera weds Arjun', 'wedding', tests.city_id('kalaburagi'),
  current_date + 60, current_date + 61, 400, 'test-ev-create-0001'));
select is(public.create_event('Meera weds Arjun', 'wedding', null, current_date + 60, null, 400, 'test-ev-create-0001'),
  (select v from ctx where k = 'event'), 'creating the same event twice returns the same event');
select is((select role::text from public.event_members where event_id = (select v from ctx where k = 'event')), 'owner',
  'the creator becomes the owner');
select throws_ok($$ select public.create_event('Too late', 'wedding', null, current_date - 30, null, null, 'test-ev-create-0002') $$,
  '22023', null, 'an event in the past is rejected');
select throws_ok($$ insert into public.events (owner_id, title, event_type, start_date, end_date)
                    values ((select v from ctx where k = 'meera'), 'Direct', 'other', current_date, current_date) $$,
  '42501', null, 'events cannot be inserted directly (only through create_event)');

select tests.login_as((select v from ctx where k = 'eve'));
select is_empty($$ select 1 from public.events where id = (select v from ctx where k = 'event') $$,
  'an outsider cannot see the event');
select throws_ok($$ select public.event_vendors((select v from ctx where k = 'event')) $$, 'P0002', null,
  'an outsider cannot list the event vendors');
select throws_ok($$ select public.invite_event_member((select v from ctx where k = 'event'), 'eve@example.test', 'cohost') $$,
  '42501', null, 'an outsider cannot invite people');

-- ---------- co-hosts & viewers ---------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'meera'));
insert into ctx values ('inv_ravi', public.invite_event_member((select v from ctx where k = 'event'), 'EV-Ravi@example.test', 'cohost'));
insert into ctx values ('inv_sita', public.invite_event_member((select v from ctx where k = 'event'), 'ev-sita@example.test', 'viewer'));
select throws_ok($$ select public.invite_event_member((select v from ctx where k = 'event'), 'ev-ravi@example.test', 'viewer') $$,
  '23505', null, 'a second pending invitation to the same email is rejected');
select throws_ok($$ select public.invite_event_member((select v from ctx where k = 'event'), 'x@example.test', 'owner') $$,
  '22023', null, 'nobody can be invited as owner');
insert into ctx values ('inv_new', public.invite_event_member((select v from ctx where k = 'event'), 'not-yet-registered@example.test', 'viewer'));

select tests.logout();
select is((select count(*)::int from public.notifications
           where user_id = (select v from ctx where k = 'ravi') and kind = 'event.invited'), 1,
  'an invited person with an account gets an in-app notification');
select is((select count(*)::int from public.notification_outbox
           where to_address = 'not-yet-registered@example.test' and channel = 'email' and template = 'event.invited'), 1,
  'an invited email without an account is queued as an email');

select tests.login_as((select v from ctx where k = 'ravi'));
select is((select count(*)::int from public.my_event_invitations()), 1, 'the invitee sees their invitation');
select throws_ok($$ select public.respond_event_invitation((select v from ctx where k = 'inv_sita'), true) $$, 'P0002', null,
  'nobody can accept an invitation addressed to someone else');
select is(public.respond_event_invitation((select v from ctx where k = 'inv_ravi'), true), (select v from ctx where k = 'event'),
  'the co-host accepts');
select tests.login_as((select v from ctx where k = 'sita'));
select lives_ok($$ select public.respond_event_invitation((select v from ctx where k = 'inv_sita'), true) $$, 'the viewer accepts');

-- ---------- guests ---------------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'ravi'));
insert into public.event_guests (event_id, name, phone, party_size, group_label, created_by)
values ((select v from ctx where k = 'event'), 'Kamala Aunty', '+919845011111', 2, 'Bride side', (select v from ctx where k = 'ravi'));
insert into ctx select 'guest', id from public.event_guests where name = 'Kamala Aunty';
select is((select count(*)::int from public.event_guests where event_id = (select v from ctx where k = 'event')), 1,
  'a co-host can add guests');
select throws_ok($$ select invite_token from public.event_guests $$, '42501', null,
  'invite tokens cannot be read straight from the table');
insert into tok values ('t1', public.guest_invite_token((select v from ctx where k = 'guest')));
select ok((select v from tok where k = 't1') ~ '^[A-Za-z0-9_-]{32}$', 'a co-host gets a 32-character private RSVP token');
select is(public.guest_invite_token((select v from ctx where k = 'guest')), (select v from tok where k = 't1'),
  'asking again returns the same link');

select tests.login_as((select v from ctx where k = 'sita'));
select is((select count(*)::int from public.event_guests), 1, 'a viewer can see the guest list');
select throws_ok($$ insert into public.event_guests (event_id, name, created_by)
                    values ((select v from ctx where k = 'event'), 'Sneaky', (select v from ctx where k = 'sita')) $$,
  '42501', null, 'a viewer cannot add guests');
select throws_ok($$ select public.guest_invite_token((select v from ctx where k = 'guest')) $$, 'P0002', null,
  'a viewer cannot get RSVP links');
update public.event_guests set name = 'Changed' where id = (select v from ctx where k = 'guest');
select tests.logout();
select is((select name from public.event_guests where id = (select v from ctx where k = 'guest')), 'Kamala Aunty',
  'a viewer cannot edit guests');

select tests.login_as((select v from ctx where k = 'eve'));
select is_empty($$ select 1 from public.event_guests $$, 'an outsider cannot see guests');

-- ---------- RSVP from the private link (no login) --------------------------------------------
select tests.login_anon();
select is((select guest_name from public.invitation_by_token((select v from tok where k = 't1'))), 'Kamala Aunty',
  'the link opens the invitation without logging in');
select is_empty($$ select * from public.invitation_by_token('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') $$,
  'an unknown link shows nothing');
select throws_ok($$ select public.respond_rsvp((select v from tok where k = 't1'), 'attending', 3, null) $$, '22023', null,
  'a guest cannot bring more people than invited');
select lives_ok($$ select public.respond_rsvp((select v from tok where k = 't1'), 'attending', 2, 'Coming with my husband') $$,
  'the guest RSVPs');
select throws_ok($$ select 1 from public.event_guests $$, '42501', null, 'anonymous visitors still cannot read the guest table');
select tests.logout();
select results_eq($$ select rsvp_status::text, attending_count from public.event_guests where id = (select v from ctx where k = 'guest') $$,
  $$ values ('attending', 2) $$, 'the RSVP is recorded');
select is((select count(*)::int from public.notifications where kind = 'rsvp.received'
           and user_id in ((select v from ctx where k = 'meera'), (select v from ctx where k = 'ravi'))), 2,
  'the owner and co-host are told about the RSVP');
select is((select count(*)::int from public.notifications where kind = 'rsvp.received' and user_id = (select v from ctx where k = 'sita')), 0,
  'viewers are not notified');

select tests.login_as((select v from ctx where k = 'meera'));
insert into tok values ('t2', public.guest_invite_token((select v from ctx where k = 'guest'), true));
select tests.login_anon();
select is_empty($$ select * from public.invitation_by_token((select v from tok where k = 't1')) $$,
  'regenerating the link revokes the old one');

-- ---------- budget lines -------------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'ravi'));
insert into public.event_budget_lines (event_id, business_category_id, planned_paise)
values ((select v from ctx where k = 'event'), tests.category_id('venues'), 50000000);
select is((select count(*)::int from public.event_budget_lines), 1, 'a co-host can plan the budget');
select tests.login_as((select v from ctx where k = 'sita'));
select throws_ok($$ insert into public.event_budget_lines (event_id, label, planned_paise)
                    values ((select v from ctx where k = 'event'), 'Jewellery', 100) $$, '42501', null,
  'a viewer cannot change the budget');

-- ---------- vendors of the event + notifications ---------------------------------------------------
select tests.login_as((select v from ctx where k = 'vendor'));
insert into ctx values ('org', public.create_organization('Ev Test Mantapa', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-ev-0001'));
update public.business_profiles set description = 'Test hall', contact_phone = '+919845000000' where organization_id = (select v from ctx where k = 'org');
insert into public.services (organization_id, service_category_id, slug, title, status, price_type, price_unit, base_price_paise, city_id, created_by)
values ((select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'kalyana-mantapa'), '',
        'Ev Hall', 'published', 'starting_from', 'per_day', 10000000, tests.city_id('kalaburagi'), (select v from ctx where k = 'vendor'));
insert into ctx select 'svc', id from public.services where title = 'Ev Hall';

select tests.login_as((select v from ctx where k = 'meera'));
insert into ctx values ('enq', public.create_enquiry((select v from ctx where k = 'svc'), current_date + 60, '10:00', '22:00', 400, null, 'test-ev-enq-0001'));
select tests.logout();
select is((select count(*)::int from public.notifications
           where user_id = (select v from ctx where k = 'vendor') and kind = 'enquiry.new'), 1,
  'the vendor owner is notified of a new enquiry');

select tests.login_as((select v from ctx where k = 'ravi'));
select throws_ok($$ select public.set_enquiry_event((select v from ctx where k = 'enq'), (select v from ctx where k = 'event')) $$,
  'P0002', null, 'only the enquiry''s customer can file it under an event');
select tests.login_as((select v from ctx where k = 'meera'));
select lives_ok($$ select public.set_enquiry_event((select v from ctx where k = 'enq'), (select v from ctx where k = 'event')) $$,
  'the owner files the enquiry under the event');

select tests.login_as((select v from ctx where k = 'sita'));
select results_eq($$ select listing_title, category_slug from public.event_vendors((select v from ctx where k = 'event')) $$,
  $$ values ('Ev Hall', 'venues') $$, 'every member sees the event''s vendors');
select is_empty($$ select 1 from public.enquiries where id = (select v from ctx where k = 'enq') $$,
  'a viewer cannot open the enquiry thread');
select tests.login_as((select v from ctx where k = 'ravi'));
select is((select count(*)::int from public.enquiries where id = (select v from ctx where k = 'enq')), 1,
  'a co-host can read the enquiry thread');
select is_empty($$ select 1 from public.notifications where user_id <> (select v from ctx where k = 'ravi') $$,
  'people only see their own notifications');
select lives_ok($$ select public.post_enquiry_message((select v from ctx where k = 'enq'), 'Co-host here: can we visit Sunday?') $$,
  'a co-host can write to the vendor');
select is((select sender_side from public.enquiry_messages where body like 'Co-host here%'), 'customer',
  'the co-host writes on the customer''s side');
select tests.login_as((select v from ctx where k = 'sita'));
select throws_ok($$ select public.post_enquiry_message((select v from ctx where k = 'enq'), 'Viewer message') $$, 'P0002', null,
  'a viewer cannot write to the vendor');

-- ---------- WhatsApp consent -----------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'meera'));
select throws_ok($$ select public.set_whatsapp_consent(true) $$, '22023', null, 'WhatsApp opt-in needs a mobile number');
update public.profiles set phone = '+919845022222' where id = (select v from ctx where k = 'meera');
select public.set_whatsapp_consent(true);
select tests.login_as((select v from ctx where k = 'vendor'));
select public.post_enquiry_message((select v from ctx where k = 'enq'), 'Hall is available on your date');
select tests.logout();
select is((select count(*)::int from public.notification_outbox
           where user_id = (select v from ctx where k = 'meera') and channel = 'whatsapp' and template = 'message.from_vendor'), 1,
  'an opted-in customer gets a WhatsApp message queued');
select is((select count(*)::int from public.notifications
           where user_id = (select v from ctx where k = 'ravi') and kind = 'message.from_vendor'), 1,
  'the co-host follows the vendor conversation');

select tests.login_as((select v from ctx where k = 'meera'));
select public.set_whatsapp_consent(false);
select tests.login_as((select v from ctx where k = 'vendor'));
select public.post_enquiry_message((select v from ctx where k = 'enq'), 'Second message');
select tests.logout();
select is((select count(*)::int from public.notification_outbox
           where user_id = (select v from ctx where k = 'meera') and channel = 'whatsapp'), 1,
  'after opting out no further WhatsApp messages are queued');

select tests.login_as((select v from ctx where k = 'meera'));
select is_empty($$ select 1 from public.notification_outbox $$, 'customers cannot read the outbox');
select throws_ok($$ select * from public.claim_outbox(10) $$, '42501', null, 'customers cannot claim outbox messages');
select ok(public.mark_notifications_read() >= 1, 'marking notifications read works');

-- ---------- membership --------------------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'ravi'));
select throws_ok($$ select public.remove_event_member((select v from ctx where k = 'event'), (select v from ctx where k = 'meera')) $$,
  'P0002', null, 'a co-host cannot remove the owner');
select tests.login_as((select v from ctx where k = 'sita'));
select public.remove_event_member((select v from ctx where k = 'event'), (select v from ctx where k = 'sita'));
select is_empty($$ select 1 from public.events where id = (select v from ctx where k = 'event') $$,
  'after leaving, the viewer no longer sees the event');

select * from finish();
rollback;
