-- Roadmap Phase A: consent at sign-up (A8), policy pages, per-channel outbox (A3/A4).
begin;
\ir 00_helpers.sql.inc

select plan(11);

-- ---------- A8: policies and consent -------------------------------------------------
select tests.login_anon();
select is((select count(*)::int from (
  select * from public.current_policy('terms_of_service') union all
  select * from public.current_policy('privacy_policy') union all
  select * from public.current_policy('refund_policy') union all
  select * from public.current_policy('vendor_agreement')) p), 4,
  'all four policies are readable by visitors');
select is((select locale::text from public.current_policy('privacy_policy', 'kn')), 'en',
  'a missing translation falls back to English');
select tests.logout();

-- Sign-up through the form (box ticked) records consent to the versions in force.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-aaaa-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'consent-yes@example.test', '{"full_name":"Consent Yes","accepted_policies":true}', now(), now());
select is((select count(*)::int from public.consent_records
           where user_id = '11111111-aaaa-4000-8000-000000000001' and granted and source = 'signup'), 2,
  'sign-up records Terms and Privacy consent');
select is((select count(*)::int from public.consent_records c
           join public.policy_versions p on p.id = c.policy_version_id
           where c.user_id = '11111111-aaaa-4000-8000-000000000001'
             and p.policy_type in ('terms_of_service', 'privacy_policy')), 2,
  'each consent points at the exact policy version accepted');

-- Accounts created another way (e.g. admin invites) record nothing on their behalf.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-aaaa-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'consent-none@example.test', '{"full_name":"Consent None"}', now(), now());
select is((select count(*)::int from public.consent_records where user_id = '11111111-aaaa-4000-8000-000000000002'), 0,
  'no consent is recorded without the tick');

-- Users read only their own consent.
select tests.login_as('11111111-aaaa-4000-8000-000000000002');
select is((select count(*)::int from public.consent_records), 0, 'others cannot see my consent records');
select tests.logout();

-- ---------- A3/A4: the dispatcher claims only channels with a provider ------------------
insert into public.notification_outbox (user_id, channel, to_address, template, params)
values ('11111111-aaaa-4000-8000-000000000001', 'whatsapp', '+919845000001', 'enquiry.new', '{}'),
       ('11111111-aaaa-4000-8000-000000000001', 'email', 'consent-yes@example.test', 'enquiry.new', '{}');

select tests.login_as('11111111-aaaa-4000-8000-000000000001');
select throws_ok($$ select * from public.claim_outbox(10, array['whatsapp']::public.notification_channel[]) $$,
  '42501', null, 'customers cannot claim outbox messages');
select tests.logout();

set local role service_role;
select is((select array_agg(channel::text) from public.claim_outbox(10, array['whatsapp']::public.notification_channel[])),
  array['whatsapp'], 'claiming WhatsApp only leaves email queued');
reset role;
select is((select status::text from public.notification_outbox where channel = 'email' and user_id = '11111111-aaaa-4000-8000-000000000001'),
  'queued', 'the email row was not touched');
select is((select attempts from public.notification_outbox where channel = 'email' and user_id = '11111111-aaaa-4000-8000-000000000001'),
  0, 'and used no retry attempt');

-- The minute job only calls out when the Vault secrets exist; without them it is a no-op.
select lives_ok($$ select private.kick_outbox() $$, 'the outbox kick is safe without configured secrets');

select * from finish();
rollback;
