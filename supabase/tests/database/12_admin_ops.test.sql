-- Phase 8: vendor suspension, user blocking, support view, admin lists, last super admin.
begin;
\ir 00_helpers.sql.inc

select plan(41);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to anon, authenticated;

insert into ctx values ('sa',    tests.create_user('adm-super@example.test', 'Super Admin'));
insert into ctx values ('sup',   tests.create_user('adm-support@example.test', 'Support Agent'));
insert into ctx values ('ver',   tests.create_user('adm-verify@example.test', 'Verify Operator'));
insert into ctx values ('fin',   tests.create_user('adm-finance@example.test', 'Finance Operator'));
insert into ctx values ('owner', tests.create_user('adm-owner@example.test', 'Vendor Owner'));
insert into ctx values ('cust',  tests.create_user('adm-cust@example.test', 'Carla Customer'));
select tests.grant_platform_role((select v from ctx where k = 'sa'), 'super_admin');
select tests.grant_platform_role((select v from ctx where k = 'sup'), 'support_agent');
select tests.grant_platform_role((select v from ctx where k = 'ver'), 'verification_operator');
select tests.grant_platform_role((select v from ctx where k = 'fin'), 'finance_operator');

-- a live vendor with a published listing
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('org', public.create_organization('Admin Test Mantapa', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-adm-0001'));
update public.business_profiles set description = 'Test hall', contact_phone = '+919845000002' where organization_id = (select v from ctx where k = 'org');
insert into public.services (organization_id, service_category_id, slug, title, status, price_type, price_unit, base_price_paise, city_id, created_by)
values ((select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'kalyana-mantapa'), '',
        'Admin Hall', 'published', 'starting_from', 'per_day', 10000000, tests.city_id('kalaburagi'), (select v from ctx where k = 'owner'));
insert into ctx select 'svc', id from public.services where title = 'Admin Hall';
select is((select status::text from public.organizations where id = (select v from ctx where k = 'org')), 'active', 'the vendor is live');

select tests.login_as((select v from ctx where k = 'cust'));
insert into ctx values ('enq', public.create_enquiry((select v from ctx where k = 'svc'), current_date + 50, '10:00', '22:00', 100, null, 'test-adm-enq-0001'));

-- ---------- vendor status -----------------------------------------------------------------------
select throws_ok($$ select public.set_organization_status((select v from ctx where k = 'org'), 'suspend', 'Fraud reports') $$,
  '42501', null, 'customers cannot suspend vendors');
select tests.login_as((select v from ctx where k = 'owner'));
select throws_ok($$ select public.set_organization_status((select v from ctx where k = 'org'), 'reinstate') $$,
  '42501', null, 'vendors cannot change their own status');
select throws_ok($$ update public.organizations set status = 'active' where id = (select v from ctx where k = 'org') $$,
  '42501', null, 'the status column cannot be written directly');
select tests.login_as((select v from ctx where k = 'ver'));
select throws_ok($$ select public.set_organization_status((select v from ctx where k = 'org'), 'suspend', 'Fraud reports') $$,
  '42501', null, 'verification operators cannot suspend vendors');

select tests.login_as((select v from ctx where k = 'sa'));
select throws_ok($$ select public.set_organization_status((select v from ctx where k = 'org'), 'suspend', '') $$,
  '22023', null, 'suspending needs a reason');
select is(public.set_organization_status((select v from ctx where k = 'org'), 'suspend', 'Many customer complaints'),
  'suspended'::public.organization_status, 'a super admin suspends the vendor');
select is((select status_reason from public.organizations where id = (select v from ctx where k = 'org')), 'Many customer complaints',
  'the reason is kept on the vendor');

select tests.login_as((select v from ctx where k = 'cust'));
select throws_ok($$ select public.create_enquiry((select v from ctx where k = 'svc'), current_date + 70, '10:00', '22:00', 100, null, 'test-adm-enq-0002') $$,
  'P0002', null, 'a suspended vendor takes no new enquiries');
select is_empty($$ select 1 from public.search_listings(p_query => 'Admin Hall') $$, 'and is hidden from search');
select is((select status::text from public.enquiries where id = (select v from ctx where k = 'enq')), 'open',
  'existing enquiries and bookings are not touched');

select tests.logout();
select is((select count(*)::int from public.notifications where user_id = (select v from ctx where k = 'owner') and kind = 'vendor.suspended'), 1,
  'the owner is notified of the suspension');
select ok(exists (select 1 from public.audit_logs where entity_table = 'organizations' and entity_id = (select v from ctx where k = 'org')::text
                  and new_data ->> 'status' = 'suspended'), 'the suspension is audited');

select tests.login_as((select v from ctx where k = 'owner'));
update public.business_profiles set tagline = 'Still editing' where organization_id = (select v from ctx where k = 'org');
select is((select status::text from public.organizations where id = (select v from ctx where k = 'org')), 'suspended',
  'editing the profile never re-activates a suspended vendor');

select tests.login_as((select v from ctx where k = 'sa'));
select is(public.set_organization_status((select v from ctx where k = 'org'), 'reinstate'), 'active'::public.organization_status,
  'reinstating brings a complete vendor straight back live');
select is(public.set_organization_status((select v from ctx where k = 'org'), 'close', 'Business shut down'), 'closed'::public.organization_status,
  'a vendor can be closed');
select throws_ok($$ select public.set_organization_status((select v from ctx where k = 'org'), 'suspend', 'Another reason') $$,
  '22023', null, 'a closed vendor must be reinstated before anything else');
select is(public.set_organization_status((select v from ctx where k = 'org'), 'reinstate'), 'active'::public.organization_status,
  'and reinstated');

-- ---------- user blocking -------------------------------------------------------------------------------
select tests.logout();
insert into auth.sessions (id, user_id) values (extensions.gen_random_uuid(), (select v from ctx where k = 'cust'));

select tests.login_as((select v from ctx where k = 'ver'));
select throws_ok($$ select public.set_user_block((select v from ctx where k = 'cust'), true, 'Spam enquiries') $$,
  '42501', null, 'operators without users.block cannot block');
select tests.login_as((select v from ctx where k = 'sup'));
select throws_ok($$ select public.set_user_block((select v from ctx where k = 'cust'), true, 'no') $$,
  '22023', null, 'blocking needs a reason');
select throws_ok($$ select public.set_user_block((select v from ctx where k = 'sup'), true, 'Testing myself') $$,
  '22023', null, 'nobody can block themselves');
select throws_ok($$ select public.set_user_block((select v from ctx where k = 'sa'), true, 'Rogue admin') $$,
  '42501', null, 'support cannot block platform staff');
select lives_ok($$ select public.set_user_block((select v from ctx where k = 'cust'), true, 'Spam enquiries to many vendors') $$,
  'support blocks a customer with a reason');

select tests.logout();
select isnt((select blocked_at from public.profiles where id = (select v from ctx where k = 'cust')), null, 'the block is recorded');
select is((select count(*)::int from auth.sessions where user_id = (select v from ctx where k = 'cust')), 0, 'their sessions are ended');
select ok(exists (select 1 from public.audit_logs where action = 'user.blocked' and entity_id = (select v from ctx where k = 'cust')::text
                  and metadata ->> 'reason' = 'Spam enquiries to many vendors'), 'the block is audited with its reason');

select tests.login_as((select v from ctx where k = 'cust'));
select is(public.my_access(), null, 'a blocked person is treated as signed out');
select throws_ok($$ update public.profiles set blocked_at = null where id = (select v from ctx where k = 'cust') $$,
  '42501', null, 'people cannot unblock themselves');

select tests.login_as((select v from ctx where k = 'sa'));
select lives_ok($$ select public.set_user_block((select v from ctx where k = 'cust'), false) $$, 'a super admin unblocks');
select tests.login_as((select v from ctx where k = 'cust'));
select isnt(public.my_access(), null, 'and the person can use the app again');

-- ---------- lists & support view -------------------------------------------------------------------------
select throws_ok($$ select * from public.admin_list_users() $$, '42501', null, 'customers cannot list users');
select tests.login_as((select v from ctx where k = 'sup'));
select results_eq($$ select full_name, roles from public.admin_list_users('adm-finance@') $$,
  $$ values ('Finance Operator'::text, array['customer', 'finance_operator']::text[]) $$, 'support finds users by email, with their roles');

select tests.login_as((select v from ctx where k = 'ver'));
select is(jsonb_array_length(public.admin_user_overview((select v from ctx where k = 'cust')) -> 'enquiries'), 1,
  'the support view lists the person''s enquiries');
select is(public.admin_user_overview((select v from ctx where k = 'cust')) -> 'payments', 'null'::jsonb,
  'operators without finance or support rights don''t see payments');
select tests.logout();
select ok((select count(*) from public.audit_logs where action = 'support.user_viewed'
           and actor_user_id = (select v from ctx where k = 'ver')) = 2, 'every support view is audited');

select tests.login_as((select v from ctx where k = 'sup'));
select is(jsonb_typeof(public.admin_user_overview((select v from ctx where k = 'cust')) -> 'payments'), 'array',
  'support sees payments in the support view');

select tests.login_as((select v from ctx where k = 'fin'));
select ok((select count(*) from public.admin_list_vendors('Admin Test')) = 1, 'finance can find vendors');
select is(jsonb_typeof(public.admin_vendor_overview((select v from ctx where k = 'org')) -> 'money'), 'object',
  'finance sees vendor money totals');
select tests.login_as((select v from ctx where k = 'sup'));
select is(public.admin_vendor_overview((select v from ctx where k = 'org')) -> 'money', 'null'::jsonb,
  'support doesn''t see vendor money totals');

select tests.login_anon();
select throws_ok($$ select * from public.admin_list_vendors() $$, '42501', null, 'anonymous visitors cannot list vendors');

-- ---------- last super admin ------------------------------------------------------------------------------
select tests.logout();
delete from public.user_role_assignments
 where role_id = (select id from public.roles where code = 'super_admin') and user_id <> (select v from ctx where k = 'sa');
select throws_ok($$ delete from public.user_role_assignments where user_id = (select v from ctx where k = 'sa')
                    and role_id = (select id from public.roles where code = 'super_admin') $$,
  '23514', null, 'the last super admin cannot be removed');

select * from finish();
rollback;
