-- Guard rail: every table in `public` has RLS enabled and at least one policy.
-- Fails automatically when a future migration forgets either.
begin;
\ir 00_helpers.sql.inc

select plan(2);

select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'every public table has row level security enabled');

select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) $$,
  'every public table has at least one explicit policy');

select * from finish();
rollback;
