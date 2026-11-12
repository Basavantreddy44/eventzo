-- =============================================================================
-- 0600 · Governance: audit logs, consent records, policy versions,
--        notification preferences
-- =============================================================================

-- ---------- audit_logs (append-only) -----------------------------------------
create table public.audit_logs (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default now(),
  actor_user_id   uuid,                 -- auth.uid(); no FK so history survives user deletion
  actor_db_role   text not null default current_user,
  organization_id uuid,
  action          text not null check (action ~ '^[a-z_]+(\.[a-z_]+)*$'),
  entity_table    text not null,
  entity_id       text,
  old_data        jsonb,
  new_data        jsonb,
  changed_fields  text[],
  metadata        jsonb not null default '{}'::jsonb
);

create index audit_logs_entity_idx on public.audit_logs (entity_table, entity_id, occurred_at desc);
create index audit_logs_org_idx    on public.audit_logs (organization_id, occurred_at desc) where organization_id is not null;
create index audit_logs_actor_idx  on public.audit_logs (actor_user_id, occurred_at desc);

comment on table public.audit_logs is
  'Append-only audit trail. Written only by SECURITY DEFINER functions/triggers.';

create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('app.allow_audit_purge', true) = 'on' then
    return old;  -- reserved for a future, explicitly-enabled retention job
  end if;
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function private.prevent_audit_mutation();

-- Explicit audit entry (used by RPCs for semantic actions such as
-- "organization.created" or "reservation.released").
create or replace function private.write_audit(
  p_action          text,
  p_entity_table    text,
  p_entity_id       text,
  p_organization_id uuid default null,
  p_old             jsonb default null,
  p_new             jsonb default null,
  p_metadata        jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_user_id, organization_id, action, entity_table, entity_id, old_data, new_data, metadata)
  values (auth.uid(), p_organization_id, p_action, p_entity_table, p_entity_id, p_old, p_new, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- Generic row-change trigger. TG_ARGV lists columns to redact (e.g. 'pan').
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new     jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row     jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_key     text;
  v_org     uuid;
  v_id      text;
begin
  -- redact sensitive columns
  foreach v_key in array coalesce(tg_argv::text[], '{}'::text[]) loop
    if v_old ? v_key then v_old := jsonb_set(v_old, array[v_key], '"[redacted]"'); end if;
    if v_new ? v_key then v_new := jsonb_set(v_new, array[v_key], '"[redacted]"'); end if;
  end loop;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(to_jsonb(new)) n
    where n.key <> 'updated_at'
      and (to_jsonb(old) -> n.key) is distinct from n.value;

    if v_changed is null then
      return new;  -- nothing but updated_at changed; not worth an entry
    end if;
  end if;

  v_org := case
    when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid
    when v_row ? 'organization_id'       then (v_row ->> 'organization_id')::uuid
  end;
  v_id := coalesce(v_row ->> 'id', v_row ->> 'organization_id', v_row ->> 'user_id');

  insert into public.audit_logs (actor_user_id, organization_id, action, entity_table, entity_id, old_data, new_data, changed_fields)
  values (auth.uid(), v_org, tg_table_name || '.' || lower(tg_op), tg_table_name, v_id, v_old, v_new, v_changed);

  return coalesce(new, old);
end;
$$;

-- Attach auditing to identity / organisation tables created so far.
create trigger audit_user_role_assignments after insert or update or delete on public.user_role_assignments for each row execute function private.audit_row_change();
create trigger audit_role_permissions      after insert or update or delete on public.role_permissions      for each row execute function private.audit_row_change();
create trigger audit_organizations         after insert or update or delete on public.organizations         for each row execute function private.audit_row_change();
create trigger audit_organization_members  after insert or update or delete on public.organization_members  for each row execute function private.audit_row_change();
create trigger audit_branches              after insert or update or delete on public.branches              for each row execute function private.audit_row_change();
create trigger audit_member_branch_access  after insert or update or delete on public.member_branch_access  for each row execute function private.audit_row_change();
create trigger audit_business_profiles     after insert or update or delete on public.business_profiles     for each row execute function private.audit_row_change('pan', 'gstin');
create trigger audit_business_documents    after insert or update or delete on public.business_documents    for each row execute function private.audit_row_change();
create trigger audit_auspicious_dates      after insert or update or delete on public.auspicious_dates      for each row execute function private.audit_row_change();

-- ---------- policy_versions --------------------------------------------------
create table public.policy_versions (
  id             uuid primary key default extensions.gen_random_uuid(),
  policy_type    public.policy_type not null,
  version        text not null check (version ~ '^[0-9]+(\.[0-9]+){0,2}$'),
  locale         public.app_locale not null default 'en',
  title          text not null,
  body_md        text not null,
  effective_from timestamptz not null,
  published_at   timestamptz,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (policy_type, version, locale)
);

create index policy_versions_current_idx on public.policy_versions (policy_type, locale, effective_from desc) where published_at is not null;

create trigger policy_versions_set_updated_at before update on public.policy_versions for each row execute function public.set_updated_at();
create trigger audit_policy_versions after insert or update or delete on public.policy_versions for each row execute function private.audit_row_change();

-- Published policy text is immutable; publish a new version instead.
create or replace function private.lock_published_policy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.published_at is not null then
    raise exception 'Published policy versions are immutable; create a new version' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger policy_versions_lock_published
  before update or delete on public.policy_versions
  for each row execute function private.lock_published_policy();

-- ---------- consent_records (append-only) ------------------------------------
-- Every grant or withdrawal is a new row; the latest row per (user, purpose,
-- channel) is the current state. Required for WhatsApp opt-in (enhancement C).
create table public.consent_records (
  id                uuid primary key default extensions.gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  purpose           public.consent_purpose not null,
  channel           public.notification_channel,
  granted           boolean not null,
  policy_version_id uuid references public.policy_versions (id) on delete restrict,
  source            text not null check (source ~ '^[a-z_]{2,40}$'),   -- signup, settings, whatsapp_optin …
  user_agent        text check (char_length(user_agent) <= 500),
  created_at        timestamptz not null default now()
);

create index consent_records_lookup_idx on public.consent_records (user_id, purpose, channel, created_at desc);

-- ---------- notification_preferences -----------------------------------------
create table public.notification_preferences (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  channel    public.notification_channel not null,
  category   text not null check (category in ('account', 'bookings', 'messages', 'payments', 'reminders', 'marketing')),
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, channel, category)
);

create trigger notification_preferences_set_updated_at before update on public.notification_preferences for each row execute function public.set_updated_at();
