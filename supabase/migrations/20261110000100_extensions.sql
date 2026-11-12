-- =============================================================================
-- 0100 · Extensions
-- All extensions live in the `extensions` schema (Supabase convention) so they
-- never pollute the exposed `public` API schema.
-- =============================================================================

create schema if not exists extensions;

create extension if not exists pgcrypto   with schema extensions;  -- gen_random_uuid(), digest()
create extension if not exists btree_gist with schema extensions;  -- uuid "=" inside GiST exclusion constraints
create extension if not exists citext     with schema extensions;  -- case-insensitive email / slug
create extension if not exists pg_trgm    with schema extensions;  -- fuzzy name search (Phase 2)

-- Private schema for internal helpers that must NOT be exposed through PostgREST.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;
