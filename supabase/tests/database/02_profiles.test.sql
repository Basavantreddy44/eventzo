-- A customer cannot read or modify another customer's profile.
begin;
\ir 00_helpers.sql.inc

select plan(10);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to authenticated;
insert into ctx values ('carol', tests.create_user('carol@example.test', 'Carol'));
insert into ctx values ('dave',  tests.create_user('dave@example.test',  'Dave'));

-- ---------- signup trigger ----------------------------------------------------
select is((select full_name from public.profiles where id = (select v from ctx where k = 'carol')), 'Carol',
  'a profile is created automatically on signup');
select ok(exists (
    select 1 from public.user_role_assignments ura join public.roles r on r.id = ura.role_id
    where ura.user_id = (select v from ctx where k = 'carol') and r.code = 'customer'),
  'new users get the customer role');

-- ---------- RLS ---------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'carol'));

select is((select count(*)::int from public.profiles), 1, 'Carol sees only her own profile');
select is_empty($$ select 1 from public.profiles where id = (select v from ctx where k = 'dave') $$, 'Carol cannot read Dave''s profile');

update public.profiles set full_name = 'Hacked' where id = (select v from ctx where k = 'dave');
select lives_ok($$ update public.profiles set full_name = 'Carol K' where id = (select v from ctx where k = 'carol') $$,
  'Carol can update her own name');

select throws_ok($$ update public.profiles set phone_verified_at = now() where id = (select v from ctx where k = 'carol') $$,
  '42501', null, 'Carol cannot mark her own phone as verified');

select throws_ok($$ insert into public.user_role_assignments (user_id, role_id, granted_by)
                    select (select v from ctx where k = 'carol'), id, (select v from ctx where k = 'carol') from public.roles where code = 'super_admin' $$,
  '42501', null, 'Carol cannot grant herself super_admin');

select is((select count(*)::int from public.user_role_assignments), 1, 'Carol sees only her own role assignments');

select tests.logout();
select is((select full_name from public.profiles where id = (select v from ctx where k = 'dave')), 'Dave',
  'Dave''s profile is unchanged by Carol''s update attempt');
select is((select full_name from public.profiles where id = (select v from ctx where k = 'carol')), 'Carol K',
  'Carol''s own update was applied');

select * from finish();
rollback;
