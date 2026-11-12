-- Non-admins cannot read audit logs; audit logs are append-only.
begin;
\ir 00_helpers.sql.inc

select plan(8);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to authenticated;
insert into ctx values ('erin',  tests.create_user('erin@example.test'));
insert into ctx values ('admin', tests.create_user('admin@example.test'));
insert into ctx values ('ops',   tests.create_user('ops@example.test'));
select tests.grant_platform_role((select v from ctx where k = 'admin'), 'super_admin');
select tests.grant_platform_role((select v from ctx where k = 'ops'), 'support_agent');

-- Erin creates an organisation → audit entries are written.
select tests.login_as((select v from ctx where k = 'erin'));
select public.create_organization('Erin Decorators', tests.category_id('decoration'), tests.city_id('kalaburagi'), 'test-idem-erin-0001');

select tests.logout();
select cmp_ok((select count(*)::int from public.audit_logs where actor_user_id = (select v from ctx where k = 'erin')), '>', 0,
  'organisation creation is audited');
select ok(exists (select 1 from public.audit_logs where action = 'organization.created'),
  'a semantic organization.created entry exists');

select tests.login_as((select v from ctx where k = 'erin'));
select is_empty($$ select 1 from public.audit_logs $$, 'a customer/vendor owner cannot read audit logs');
select throws_ok($$ insert into public.audit_logs (action, entity_table) values ('fake.entry', 'x') $$,
  '42501', null, 'clients cannot write audit logs');

select tests.login_as((select v from ctx where k = 'ops'));
select is_empty($$ select 1 from public.audit_logs $$, 'a support agent (no audit.read) cannot read audit logs');

select tests.login_as((select v from ctx where k = 'admin'));
select isnt_empty($$ select 1 from public.audit_logs $$, 'a super admin can read audit logs');

select tests.logout();
select throws_ok($$ update public.audit_logs set action = 'tampered' $$, '42501', null, 'audit logs cannot be updated, even by the owner role');
select throws_ok($$ delete from public.audit_logs $$, '42501', null, 'audit logs cannot be deleted');

select * from finish();
rollback;
