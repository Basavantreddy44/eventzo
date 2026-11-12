-- A user from organisation A cannot read or write organisation B's rows.
begin;
\ir 00_helpers.sql.inc

select plan(20);

-- ---------- setup ------------------------------------------------------------
create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to authenticated;

insert into ctx values ('alice', tests.create_user('alice@example.test', 'Alice'));
insert into ctx values ('bob',   tests.create_user('bob@example.test',   'Bob'));

select tests.login_as((select v from ctx where k = 'alice'));
insert into ctx values ('org_a', public.create_organization('Alpha Kalyana Mantapa', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-alpha-0001'));

select tests.login_as((select v from ctx where k = 'bob'));
insert into ctx values ('org_b', public.create_organization('Beta Caterers', tests.category_id('catering'), tests.city_id('bengaluru'), 'test-idem-beta-0001'));
insert into public.bookable_resources (organization_id, kind, name)
values ((select v from ctx where k = 'org_b'), 'team', 'Beta kitchen team');
insert into ctx values ('res_b', (select id from public.bookable_resources where name = 'Beta kitchen team'));

-- ---------- onboarding RPC ---------------------------------------------------
select tests.login_as((select v from ctx where k = 'alice'));

select ok(public.has_org_role((select v from ctx where k = 'org_a'), array['owner']),
  'create_organization makes the caller the owner');

select is(
  public.create_organization('Alpha Kalyana Mantapa', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-alpha-0001'),
  (select v from ctx where k = 'org_a'),
  'create_organization is idempotent for the same key');

select is((select count(*)::int from public.branches where organization_id = (select v from ctx where k = 'org_a')), 1,
  'a primary branch is created with the organisation');

-- ---------- reads ------------------------------------------------------------
select is((select count(*)::int from public.organizations), 1, 'Alice sees exactly one organisation (her own)');
select is_empty($$ select 1 from public.organizations where id = (select v from ctx where k = 'org_b') $$, 'Alice cannot read org B');
select is_empty($$ select 1 from public.organization_members where organization_id = (select v from ctx where k = 'org_b') $$, 'Alice cannot read org B members');
select is_empty($$ select 1 from public.branches where organization_id = (select v from ctx where k = 'org_b') $$, 'Alice cannot read org B branches');
select is_empty($$ select 1 from public.business_profiles where organization_id = (select v from ctx where k = 'org_b') $$, 'Alice cannot read org B business profile');
select is_empty($$ select 1 from public.bookable_resources where organization_id = (select v from ctx where k = 'org_b') $$, 'Alice cannot read org B resources');

-- ---------- writes -----------------------------------------------------------
select throws_ok(
  $$ insert into public.branches (organization_id, name) values ((select v from ctx where k = 'org_b'), 'Hijacked branch') $$,
  '42501', null, 'Alice cannot create a branch in org B');

select throws_ok(
  $$ insert into public.bookable_resources (organization_id, kind, name) values ((select v from ctx where k = 'org_b'), 'venue_space', 'Hijack hall') $$,
  '42501', null, 'Alice cannot create a resource in org B');

select throws_ok(
  $$ select public.reserve_resource((select v from ctx where k = 'res_b'), '2027-02-01 10:00+05:30', '2027-02-01 12:00+05:30', 'manual_block', 'blocked') $$,
  '42501', null, 'Alice cannot reserve org B''s resource');

select throws_ok(
  $$ insert into public.organizations (name, slug, created_by) values ('Direct', 'direct-insert', (select v from ctx where k = 'alice')) $$,
  '42501', null, 'organisations cannot be inserted directly (RPC only)');

select throws_ok(
  $$ insert into public.organization_members (organization_id, user_id, role) values ((select v from ctx where k = 'org_b'), (select v from ctx where k = 'alice'), 'owner') $$,
  '42501', null, 'Alice cannot add herself to org B');

select throws_ok(
  $$ update public.organizations set status = 'active', verification_status = 'verified' where id = (select v from ctx where k = 'org_a') $$,
  '42501', null, 'an owner cannot self-verify their organisation');

-- Updates/deletes on invisible rows silently affect nothing.
update public.organizations set name = 'Pwned' where id = (select v from ctx where k = 'org_b');
delete from public.branches where organization_id = (select v from ctx where k = 'org_b');

select tests.logout();
select is((select name from public.organizations where id = (select v from ctx where k = 'org_b')), 'Beta Caterers',
  'org B name unchanged after Alice''s update attempt');
select is((select count(*)::int from public.branches where organization_id = (select v from ctx where k = 'org_b')), 1,
  'org B branch survives Alice''s delete attempt');

-- ---------- owner can still manage own org ------------------------------------
select tests.login_as((select v from ctx where k = 'alice'));
select lives_ok(
  $$ update public.organizations set legal_name = 'Alpha Events Pvt Ltd' where id = (select v from ctx where k = 'org_a') $$,
  'Alice can update her own organisation');

-- ---------- anonymous users see nothing private --------------------------------
select tests.login_anon();
select throws_ok($$ select 1 from public.organizations $$, '42501', null, 'anon cannot read organisations');
select isnt_empty($$ select 1 from public.business_categories $$, 'anon can read the public category taxonomy');

select * from finish();
rollback;
