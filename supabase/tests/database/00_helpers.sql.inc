-- Shared pgTAP helpers. Included by every *.test.sql file via \ir.
-- Everything here lives inside the test transaction and is rolled back.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Create an auth user (the on_auth_user_created trigger creates the profile
-- and the default customer role).
create or replace function tests.create_user(p_email text, p_full_name text default null)
returns uuid
language plpgsql
as $$
declare v_id uuid := extensions.gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
          jsonb_build_object('full_name', coalesce(p_full_name, split_part(p_email, '@', 1))), now(), now());
  return v_id;
end;
$$;

-- Act as a signed-in user, exactly like PostgREST does.
create or replace function tests.login_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.login_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Back to the superuser session (bypasses RLS) for setup and assertions.
create or replace function tests.logout()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function tests.grant_platform_role(p_user_id uuid, p_role_code text)
returns void
language sql
as $$
  insert into public.user_role_assignments (user_id, role_id)
  select p_user_id, id from public.roles where code = p_role_code;
$$;

create or replace function tests.category_id(p_slug text) returns uuid language sql stable as
  $$ select id from public.business_categories where slug = p_slug $$;

create or replace function tests.city_id(p_slug text) returns uuid language sql stable as
  $$ select id from public.cities where slug = p_slug $$;

grant execute on all functions in schema tests to anon, authenticated;
