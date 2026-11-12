// Fast, Docker-free check: applies supabase/migrations + seed.sql to PGlite
// (Postgres 17 in WASM) with a minimal Supabase stand-in (auth.uid(), roles,
// storage tables) and runs the pgTAP suite in supabase/tests/database.
// It does NOT replace `npm run db:test` against the real Supabase stack.
// Usage: npm run db:check
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgtap } from "@electric-sql/pglite-pgtap";

const root = process.argv[2] ?? process.cwd();
const db = new PGlite({ extensions: { pgcrypto, btree_gist, citext, pg_trgm, pgtap } });

const supabaseShim = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key, instance_id uuid, aud text, role text, email text,
  raw_user_meta_data jsonb default '{}'::jsonb, encrypted_password text,
  created_at timestamptz, updated_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant all on storage.objects to authenticated;
set search_path = "$user", public, extensions;
`;

function tapLines(results) {
  const out = [];
  for (const r of results)
    for (const row of r.rows ?? []) {
      const v = Object.values(row)[0];
      if (typeof v === "string" && /^(ok|not ok|#|\s+#|1\.\.)/.test(v)) out.push(v);
    }
  return out;
}

let failed = 0;
try {
  await db.exec(supabaseShim);
  const migDir = join(root, "supabase", "migrations");
  for (const f of readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    try {
      await db.exec(readFileSync(join(migDir, f), "utf8"));
      console.log("migrated", f);
    } catch (e) {
      console.error("MIGRATION FAILED", f, "\n ", e.message, e.where ?? "", e.position ?? "");
      process.exit(1);
    }
  }
  await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
  console.log("seeded");

  const testDir = join(root, "supabase", "tests", "database");
  const helpers = readFileSync(join(testDir, "00_helpers.sql.inc"), "utf8");
  for (const f of readdirSync(testDir)
    .filter((f) => f.endsWith(".test.sql"))
    .sort()) {
    const sql = readFileSync(join(testDir, f), "utf8").replace(/^\\ir 00_helpers\.sql\.inc$/m, () => helpers);
    console.log(`\n=== ${f}`);
    try {
      const lines = tapLines(await db.exec(sql));
      for (const l of lines) console.log(l);
      failed += lines.filter((l) => l.startsWith("not ok")).length;
      if (lines.some((l) => /Looks like|planned/.test(l))) failed += 1;
    } catch (e) {
      failed += 1;
      console.error("TEST FILE ERROR", e.message, e.where ?? "");
      await db.exec("rollback").catch(() => {});
    }
  }
} finally {
  console.log(failed ? `\nFAILED: ${failed}` : "\nALL PASSED");
  process.exit(failed ? 1 : 0);
}
