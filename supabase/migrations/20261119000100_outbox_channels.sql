-- =============================================================================
-- 2000 · Roadmap A3/A4: real WhatsApp (Meta Cloud API) and email (Resend)
-- delivery. Each channel is sent only when its provider is configured, so the
-- dispatcher claims only those channels; the others stay queued untouched.
-- =============================================================================

drop function if exists public.claim_outbox(int);

create or replace function public.claim_outbox(
  p_limit    int default 25,
  p_channels public.notification_channel[] default null   -- null = every channel
)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_system_caller() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  update public.notification_outbox o
     set attempts = o.attempts + 1, next_attempt_at = now() + interval '10 minutes'
   where o.id in (select q.id from public.notification_outbox q
                  where q.status = 'queued' and q.next_attempt_at <= now()
                    and (p_channels is null or q.channel = any (p_channels))
                  order by q.next_attempt_at limit least(greatest(coalesce(p_limit, 25), 1), 100)
                  for update skip locked)
  returning o.*;
end;
$$;

revoke all on function public.claim_outbox(int, public.notification_channel[]) from public, anon, authenticated;

-- ---------- send within a minute on any Vercel plan ------------------------------
-- Vercel Hobby runs cron jobs only once a day. Instead, pg_cron checks every
-- minute and, only when messages are waiting, calls the app's send endpoint
-- through pg_net. The site URL and CRON_SECRET are read from Supabase Vault
-- (secrets "eventzo_site_url" and "eventzo_cron_secret"), never stored here.
-- Until both secrets exist the job does nothing.
create or replace function private.kick_outbox()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from public.notification_outbox
                 where status = 'queued' and next_attempt_at <= now()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'eventzo_site_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'eventzo_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url     := rtrim(v_url, '/') || '/api/cron/notifications',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000);
end;
$$;

revoke all on function private.kick_outbox() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'supabase_vault') then
    create extension if not exists pg_net;
    perform cron.schedule('kick-notification-outbox', '* * * * *', 'select private.kick_outbox()');
  else
    raise notice 'pg_net/pg_cron/vault not available; outbox is sent by Vercel Cron only';
  end if;
end;
$$;
