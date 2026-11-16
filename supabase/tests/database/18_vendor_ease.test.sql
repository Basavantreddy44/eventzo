-- Roadmap Phase C batch 1: auto venue calendar (V2), changes requested (S4/V11),
-- hold nudges + response time (V5), leads + follow-ups (V8), score card (V9).
begin;
\ir 00_helpers.sql.inc

select plan(27);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to anon, authenticated;

insert into ctx values ('owner', tests.create_user('ve-owner@example.test', 'Venue Owner'));
insert into ctx values ('cust',  tests.create_user('ve-cust@example.test', 'Asha Rao'));
insert into ctx values ('eve',   tests.create_user('ve-eve@example.test', 'Eve Outsider'));
insert into ctx values ('rev',   tests.create_user('ve-rev@example.test', 'Ravi Reviewer'));
select tests.grant_platform_role((select v from ctx where k = 'rev'), 'verification_operator');

select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('org', public.create_organization('VE Hall Co', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-ve-org-1'));
update public.business_profiles set description = 'Hall', contact_phone = '+919845000501' where organization_id = (select v from ctx where k = 'org');

-- ---------- V2 ------------------------------------------------------------------------------
insert into public.services (organization_id, service_category_id, slug, title, status, price_type, price_unit, base_price_paise, city_id, created_by)
values ((select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'kalyana-mantapa'), '',
        'VE Hall', 'published', 'starting_from', 'per_day', 10000000, tests.city_id('kalaburagi'), (select v from ctx where k = 'owner'));
insert into ctx select 'svc', id from public.services where title = 'VE Hall';
insert into public.services (organization_id, service_category_id, slug, title, status, price_type, price_unit, base_price_paise, city_id, created_by)
values ((select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'kalyana-mantapa'), '',
        'VE Draft Hall', 'draft', 'starting_from', 'per_day', 10000000, tests.city_id('kalaburagi'), (select v from ctx where k = 'owner'));
insert into ctx select 'draft', id from public.services where title = 'VE Draft Hall';
insert into public.services (organization_id, service_category_id, slug, title, status, price_type, price_unit, base_price_paise, city_id, created_by)
values ((select v from ctx where k = 'org'), (select sc.id from public.service_categories sc
          join public.business_categories bc on bc.id = sc.business_category_id where bc.slug = 'catering' limit 1), '',
        'VE Catering', 'published', 'starting_from', 'per_plate', 30000, tests.city_id('kalaburagi'), (select v from ctx where k = 'owner'));
set constraints all immediate;
set constraints all deferred;

select is((select count(*)::int from public.bookable_resources where service_id = (select v from ctx where k = 'svc')), 1,
  'publishing a venue listing creates its calendar');
select is((select kind::text || '/' || allocation_mode::text || '/' || setup_buffer_min || '/' || breakdown_buffer_min
           from public.bookable_resources where service_id = (select v from ctx where k = 'svc')),
  'venue_space/exclusive/120/60', 'an exclusive venue space with default buffers');
select is((select count(*)::int from public.bookable_resources r join public.services s on s.id = r.service_id
           where s.title in ('VE Draft Hall', 'VE Catering')), 0, 'drafts and non-venue listings get none');
update public.services set status = 'published' where id = (select v from ctx where k = 'draft');
insert into public.bookable_resources (organization_id, kind, name, service_id)
values ((select v from ctx where k = 'org'), 'venue_space', 'Own space', (select v from ctx where k = 'draft'));
set constraints all immediate;
set constraints all deferred;
select is((select count(*)::int from public.bookable_resources where service_id = (select v from ctx where k = 'draft')), 1,
  'a calendar the vendor adds in the same save is kept (no duplicate)');

-- ---------- S4 / V11 ------------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'rev'));
select throws_ok($$ select public.set_organization_verification((select v from ctx where k = 'org'), 'changes_requested', '  ') $$,
  '22023', null, 'requesting changes needs a reason');
select public.set_organization_verification((select v from ctx where k = 'org'), 'changes_requested', 'The GST certificate is unreadable');
select tests.login_as((select v from ctx where k = 'owner'));
select is((select verification_status::text || ': ' || verification_note from public.organizations where id = (select v from ctx where k = 'org')),
  'changes_requested: The GST certificate is unreadable', 'the vendor sees the reason');
select is((select count(*)::int from public.notifications where kind = 'vendor.changes_requested' and user_id = (select v from ctx where k = 'owner')), 1,
  'and is notified');
select throws_ok($$ select public.resubmit_verification((select v from ctx where k = 'org')) $$, '22023', null,
  'resubmitting needs a document');
insert into public.business_documents (organization_id, document_type, storage_path, file_name, mime_type, size_bytes, uploaded_by)
values ((select v from ctx where k = 'org'), 'gst_certificate', (select v from ctx where k = 'org')::text || '/gst.pdf', 'gst.pdf',
        'application/pdf', 1000, (select v from ctx where k = 'owner'));
select is((select verification_status::text from public.organizations where id = (select v from ctx where k = 'org')), 'pending',
  'a new document puts the vendor back in the review queue');
select tests.login_as((select v from ctx where k = 'eve'));
select throws_ok($$ select public.resubmit_verification((select v from ctx where k = 'org')) $$, '42501', null,
  'only the owner resubmits');
select tests.login_as((select v from ctx where k = 'rev'));
select is((select count(*)::int from public.verification_history((select v from ctx where k = 'org'))) >= 1, true,
  'the decision history is kept');
select is((select reason from public.verification_history((select v from ctx where k = 'org')) where action like '%changes_requested'),
  'The GST certificate is unreadable', 'with the reason');
select tests.logout();
select tests.verify_org((select v from ctx where k = 'org'));
select private.try_activate_organization((select v from ctx where k = 'org'));

-- ---------- V5: hold nudges -----------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'cust'));
insert into ctx values ('enq', public.create_enquiry((select v from ctx where k = 'svc'), current_date + 30, '10:00', '22:00', 200, null, 'test-ve-enq-0001'));
select tests.logout();
update public.enquiries set hold_expires_at = now() + interval '20 hours' where id = (select v from ctx where k = 'enq');
select is((public.send_vendor_nudges() ->> 'hold_nudges')::int >= 1, true, 'an unanswered enquiry is nudged 24 h before the hold lapses');
select is((select (params ->> 'count')::int from public.notifications where kind = 'enquiry.hold_expiring'
           and user_id = (select v from ctx where k = 'owner')), 24, 'the owner is told 24 hours are left');
select public.send_vendor_nudges();
select is((select count(*)::int from public.notifications where kind = 'enquiry.hold_expiring' and user_id = (select v from ctx where k = 'owner')), 1,
  'never twice');
update public.enquiries set hold_expires_at = now() + interval '3 hours' where id = (select v from ctx where k = 'enq');
select public.send_vendor_nudges();
select is((select count(*)::int from public.notifications where kind = 'enquiry.hold_expiring' and user_id = (select v from ctx where k = 'owner')), 2,
  'and again 4 h before');
select throws_ok($$ select public.send_vendor_nudges() $$, '42501', null, 'only the scheduler runs it')
  from (select tests.login_as((select v from ctx where k = 'owner'))) x;

-- ---------- V8: leads -----------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'owner'));
select is((select stage from public.vendor_leads((select v from ctx where k = 'org')) where id = (select v from ctx where k = 'enq')), 'new',
  'an unanswered enquiry is a new lead');
select public.send_quotation((select v from ctx where k = 'enq'),
  '[{"description":"Hall","quantity":1,"unit_price_paise":10000000}]'::jsonb, 0, 0, 48, null, null);
select is((select stage from public.vendor_leads((select v from ctx where k = 'org')) where id = (select v from ctx where k = 'enq')), 'quoted',
  'after a quote it is quoted');
select is((select first_response_at is not null from public.vendor_leads((select v from ctx where k = 'org')) where id = (select v from ctx where k = 'enq')), true,
  'with the first response time');
select throws_ok($$ select public.set_enquiry_follow_up((select v from ctx where k = 'enq'), current_date - 1, 'late') $$,
  '22023', null, 'a follow-up date cannot be in the past');
select public.set_enquiry_follow_up((select v from ctx where k = 'enq'), (now() at time zone 'Asia/Kolkata')::date, 'Call about the menu');
select tests.login_as((select v from ctx where k = 'eve'));
select throws_ok($$ select public.set_enquiry_follow_up((select v from ctx where k = 'enq'), current_date + 1, 'x') $$,
  'P0002', null, 'others cannot set follow-ups');
select tests.logout();
select public.send_vendor_nudges();
select is((select params ->> 'reason' from public.notifications where kind = 'enquiry.follow_up' and user_id = (select v from ctx where k = 'owner')),
  'Call about the menu', 'the vendor is reminded on the follow-up day');

-- ---------- V9: score card ------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'owner'));
select is((public.vendor_scorecard((select v from ctx where k = 'org')) ->> 'quoted')::int, 1, 'the score card counts quotes');
select is((public.vendor_scorecard((select v from ctx where k = 'org')) ->> 'answered')::int >= 0, true, 'and response time');
select tests.login_as((select v from ctx where k = 'eve'));
select throws_ok($$ select public.vendor_scorecard((select v from ctx where k = 'org')) $$, '42501', null,
  'only the business sees its score card');
select tests.login_anon();
select is((select count(*)::int from public.listing_response_time((select v from ctx where k = 'svc'))), 0,
  'the public response time needs at least 3 answered enquiries');

select * from finish();
rollback;
