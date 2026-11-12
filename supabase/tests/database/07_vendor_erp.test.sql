-- Phase 3: automatic go-live, verification workflow, team invitations, directory.
begin;
\ir 00_helpers.sql.inc

select plan(28);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to anon, authenticated;

insert into ctx values ('owner',    tests.create_user('erp-owner@example.test', 'Erp Owner'));
insert into ctx values ('invitee',  tests.create_user('erp-invitee@example.test', 'Erp Invitee'));
insert into ctx values ('stranger', tests.create_user('erp-stranger@example.test', 'Erp Stranger'));
insert into ctx values ('operator', tests.create_user('erp-operator@example.test', 'Erp Operator'));
select tests.grant_platform_role((select v from ctx where k = 'operator'), 'verification_operator');

select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('org', public.create_organization('Kappa Test Mantapa', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-kappa-001'));
insert into ctx select 'branch', id from public.branches where organization_id = (select v from ctx where k = 'org');

-- ---------- automatic go-live ------------------------------------------------------
insert into public.services (organization_id, service_category_id, title, status, price_type, price_unit, base_price_paise, city_id, created_by)
values ((select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'kalyana-mantapa'),
        'Kappa Main Hall', 'published', 'starting_from', 'per_day', 5000000, tests.city_id('kalaburagi'),
        (select v from ctx where k = 'owner'));

select is((select status::text from public.organizations where id = (select v from ctx where k = 'org')), 'draft',
  'a published listing alone does not make the vendor go live');

update public.business_profiles set description = 'A family-run mantapa.' where organization_id = (select v from ctx where k = 'org');
select is((select status::text from public.organizations where id = (select v from ctx where k = 'org')), 'draft',
  'without a contact phone the vendor stays in draft');

update public.business_profiles set contact_phone = '+919845012345' where organization_id = (select v from ctx where k = 'org');
select is((select status::text from public.organizations where id = (select v from ctx where k = 'org')), 'active',
  'profile complete + published listing → the vendor goes live automatically');

select tests.login_anon();
select is((select count(*)::int from public.search_listings('Kappa')), 1, 'the listing is now public');

select tests.logout();
select ok(exists (select 1 from public.audit_logs where action = 'organization.activated'
                   and organization_id = (select v from ctx where k = 'org')), 'go-live is audited');

-- ---------- verification workflow ------------------------------------------------------
select tests.login_as((select v from ctx where k = 'owner'));
insert into public.business_documents (organization_id, document_type, storage_path, file_name, mime_type, size_bytes, uploaded_by)
values ((select v from ctx where k = 'org'), 'gst_certificate', (select v from ctx where k = 'org')::text || '/gst.pdf',
        'gst.pdf', 'application/pdf', 12345, (select v from ctx where k = 'owner'));
insert into ctx select 'doc', id from public.business_documents where organization_id = (select v from ctx where k = 'org');

select is((select verification_status::text from public.organizations where id = (select v from ctx where k = 'org')), 'pending',
  'uploading a document puts the vendor in the review queue');

select throws_ok($$ select public.review_business_document((select v from ctx where k = 'doc'), true) $$,
  '42501', null, 'a vendor cannot approve their own document');
select throws_ok($$ select public.set_organization_verification((select v from ctx where k = 'org'), 'verified') $$,
  '42501', null, 'a vendor cannot verify themselves');

select tests.login_as((select v from ctx where k = 'operator'));
select isnt_empty($$ select 1 from public.business_documents where id = (select v from ctx where k = 'doc') $$,
  'a verification operator can see uploaded documents');
select throws_ok($$ select public.set_organization_verification((select v from ctx where k = 'org'), 'verified') $$,
  '23514', null, 'a vendor cannot be verified before a document is approved');
select throws_ok($$ select public.review_business_document((select v from ctx where k = 'doc'), false, '  ') $$,
  '22023', null, 'rejecting a document requires a reason');
select is((public.review_business_document((select v from ctx where k = 'doc'), true)).status::text, 'approved',
  'an operator can approve a document');
select is((public.set_organization_verification((select v from ctx where k = 'org'), 'verified')).verification_status::text, 'verified',
  'an operator can then mark the vendor verified');

-- ---------- invitations ------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'stranger'));
select throws_ok($$ select public.create_invitation((select v from ctx where k = 'org'), 'someone@example.test', 'staff') $$,
  '42501', null, 'a non-owner cannot invite');

select tests.login_as((select v from ctx where k = 'owner'));
select throws_ok($$ select public.create_invitation((select v from ctx where k = 'org'), 'erp-owner@example.test', 'staff') $$,
  '23505', null, 'an existing member cannot be invited again');
select throws_ok($$ select public.create_invitation((select v from ctx where k = 'org'), 'x@example.test', 'staff', array[extensions.gen_random_uuid()]) $$,
  '22023', null, 'invitations can only grant branches of the same organisation');
insert into ctx values ('inv', public.create_invitation((select v from ctx where k = 'org'), 'ERP-Invitee@Example.test', 'branch_manager',
                                                       array[(select v from ctx where k = 'branch')]));
select throws_ok($$ select public.create_invitation((select v from ctx where k = 'org'), 'erp-invitee@example.test', 'staff') $$,
  '23505', null, 'only one pending invitation per email');
select is((select count(*)::int from public.organization_invitations), 1, 'the owner sees the invitation');

select tests.login_as((select v from ctx where k = 'stranger'));
select is_empty($$ select 1 from public.organization_invitations $$, 'other users cannot see the invitation');
select throws_ok($$ select public.respond_invitation((select v from ctx where k = 'inv'), true) $$,
  'P0002', null, 'other users cannot accept the invitation');

select tests.login_as((select v from ctx where k = 'invitee'));
select is((select organization_name from public.my_invitations()), 'Kappa Test Mantapa', 'the invitee sees it, with the vendor name');
select is(public.respond_invitation((select v from ctx where k = 'inv'), true), (select v from ctx where k = 'org'),
  'the invitee can accept');
select ok(public.has_org_role((select v from ctx where k = 'org'), array['branch_manager']), 'accepting grants the invited role');
select ok(public.can_access_branch((select v from ctx where k = 'branch')), 'accepting grants the invited branches');
select is((select status::text from public.organization_invitations where id = (select v from ctx where k = 'inv')), 'accepted',
  'the invitation is marked accepted');

-- ---------- directory ---------------------------------------------------------------------
select is((select count(*)::int from public.org_member_directory((select v from ctx where k = 'org'))), 2, 'members see the team');
select ok((select bool_and(email is null) from public.org_member_directory((select v from ctx where k = 'org'))),
  'non-owners do not see team emails');

select tests.login_as((select v from ctx where k = 'stranger'));
select throws_ok($$ select * from public.org_member_directory((select v from ctx where k = 'org')) $$,
  '42501', null, 'outsiders cannot read the team directory');

select * from finish();
rollback;
