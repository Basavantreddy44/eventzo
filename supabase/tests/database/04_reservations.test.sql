-- Unified availability (D5): overlapping exclusive reservations are rejected,
-- buffers are respected, expired holds never block, capacity is enforced.
begin;
\ir 00_helpers.sql.inc

select plan(16);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to authenticated;

insert into ctx values ('owner', tests.create_user('owner@example.test'));
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('org', public.create_organization('Gulbarga Grand Hall', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-grand-0001'));
insert into ctx values ('branch', (select id from public.branches where organization_id = (select v from ctx where k = 'org')));

insert into public.bookable_resources (organization_id, branch_id, kind, name)
values ((select v from ctx where k = 'org'), (select v from ctx where k = 'branch'), 'venue_space', 'Main hall');
insert into public.bookable_resources (organization_id, branch_id, kind, name, breakdown_buffer_min)
values ((select v from ctx where k = 'org'), (select v from ctx where k = 'branch'), 'venue_space', 'Lawn', 60);
insert into public.bookable_resources (organization_id, branch_id, kind, name, allocation_mode, capacity)
values ((select v from ctx where k = 'org'), (select v from ctx where k = 'branch'), 'equipment', 'Chairs (sets of 100)', 'capacity', 3);

insert into ctx select 'hall',   id from public.bookable_resources where name = 'Main hall';
insert into ctx select 'lawn',   id from public.bookable_resources where name = 'Lawn';
insert into ctx select 'chairs', id from public.bookable_resources where name = 'Chairs (sets of 100)';

-- ---------- exclusive ----------------------------------------------------------
select lives_ok(
  $$ select public.reserve_resource((select v from ctx where k = 'hall'), '2027-01-15 10:00+05:30', '2027-01-15 14:00+05:30', 'manual_block', 'blocked') $$,
  'first block on the hall succeeds');

select throws_ok(
  $$ select public.reserve_resource((select v from ctx where k = 'hall'), '2027-01-15 12:00+05:30', '2027-01-15 16:00+05:30', 'offline', 'confirmed') $$,
  '23P01', null, 'an overlapping exclusive reservation is rejected');

select lives_ok(
  $$ select public.reserve_resource((select v from ctx where k = 'hall'), '2027-01-15 14:00+05:30', '2027-01-15 18:00+05:30', 'offline', 'confirmed') $$,
  'a back-to-back reservation is allowed (half-open ranges)');

select tests.logout();
select throws_ok(
  $$ insert into public.resource_reservations (resource_id, organization_id, period, status, source)
     values ((select v from ctx where k = 'hall'), (select v from ctx where k = 'org'),
             tstzrange('2027-01-15 11:00+05:30', '2027-01-15 11:30+05:30', '[)'), 'blocked', 'manual_block') $$,
  '23P01', null, 'the exclusion constraint itself rejects overlaps (not only the RPC)');
select tests.login_as((select v from ctx where k = 'owner'));

select throws_ok(
  $$ insert into public.resource_reservations (resource_id, organization_id, period, status, source)
     values ((select v from ctx where k = 'hall'), (select v from ctx where k = 'org'),
             tstzrange('2027-03-01 10:00+05:30', '2027-03-01 11:00+05:30', '[)'), 'blocked', 'manual_block') $$,
  '42501', null, 'clients cannot insert reservations directly');

-- ---------- buffers ------------------------------------------------------------
select lives_ok(
  $$ select public.reserve_resource((select v from ctx where k = 'lawn'), '2027-01-20 10:00+05:30', '2027-01-20 14:00+05:30', 'offline', 'confirmed') $$,
  'lawn booking succeeds');
select throws_ok(
  $$ select public.reserve_resource((select v from ctx where k = 'lawn'), '2027-01-20 14:30+05:30', '2027-01-20 16:00+05:30', 'offline', 'confirmed') $$,
  '23P01', null, 'the 60-minute breakdown buffer blocks a booking 30 minutes later');
select lives_ok(
  $$ select public.reserve_resource((select v from ctx where k = 'lawn'), '2027-01-20 15:00+05:30', '2027-01-20 17:00+05:30', 'offline', 'confirmed') $$,
  'a booking after the buffer succeeds');

-- ---------- release & rebook ------------------------------------------------------
select lives_ok(
  $$ select public.release_reservation(
       (select id from public.resource_reservations where resource_id = (select v from ctx where k = 'hall') and source = 'manual_block'),
       false, 'Customer changed date') $$,
  'the owner can release a manual block');
select lives_ok(
  $$ select public.reserve_resource((select v from ctx where k = 'hall'), '2027-01-15 10:00+05:30', '2027-01-15 13:00+05:30', 'offline', 'confirmed') $$,
  'a released slot can be booked again');

-- ---------- expired holds ---------------------------------------------------------
select tests.logout();
insert into public.resource_reservations (resource_id, organization_id, period, status, source, hold_expires_at)
values ((select v from ctx where k = 'hall'), (select v from ctx where k = 'org'),
        tstzrange('2027-02-10 10:00+05:30', '2027-02-10 12:00+05:30', '[)'), 'hold', 'platform', now() - interval '5 minutes');
select tests.login_as((select v from ctx where k = 'owner'));

select lives_ok(
  $$ select public.reserve_resource((select v from ctx where k = 'hall'), '2027-02-10 10:00+05:30', '2027-02-10 12:00+05:30', 'offline', 'confirmed') $$,
  'an expired hold does not block a new reservation');
select is(
  (select status::text from public.resource_reservations where source = 'platform' and resource_id = (select v from ctx where k = 'hall')),
  'released', 'the expired hold was released');

-- ---------- capacity ------------------------------------------------------------
select lives_ok(
  $$ select public.reserve_resource((select v from ctx where k = 'chairs'), '2027-01-25 08:00+05:30', '2027-01-25 20:00+05:30', 'offline', 'confirmed', 2) $$,
  'capacity: 2 of 3 reserved');
select lives_ok(
  $$ select public.reserve_resource((select v from ctx where k = 'chairs'), '2027-01-25 12:00+05:30', '2027-01-25 18:00+05:30', 'offline', 'confirmed', 1) $$,
  'capacity: 3 of 3 reserved');
select throws_ok(
  $$ select public.reserve_resource((select v from ctx where k = 'chairs'), '2027-01-25 15:00+05:30', '2027-01-25 16:00+05:30', 'offline', 'confirmed', 1) $$,
  '23P01', null, 'capacity: a 4th unit is rejected');

-- ---------- idempotency -------------------------------------------------------------
insert into ctx
select 'idem_first', (public.reserve_resource((select v from ctx where k = 'hall'), '2027-04-01 10:00+05:30', '2027-04-01 12:00+05:30', 'offline', 'confirmed', 1, null, null, 'test-reserve-key-01')).id;

select is(
  (select (public.reserve_resource((select v from ctx where k = 'hall'), '2027-04-01 10:00+05:30', '2027-04-01 12:00+05:30', 'offline', 'confirmed', 1, null, null, 'test-reserve-key-01')).id),
  (select v from ctx where k = 'idem_first'),
  'reserve_resource is idempotent for the same key');

select * from finish();
rollback;
