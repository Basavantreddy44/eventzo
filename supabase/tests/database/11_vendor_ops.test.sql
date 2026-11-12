-- Phase 7: staff roster, jobs & assignments, staff job view, expenses, receipts, reports.
begin;
\ir 00_helpers.sql.inc

select plan(64);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to anon, authenticated;

insert into ctx values ('owner', tests.create_user('ops-owner@example.test', 'Ops Owner'));
insert into ctx values ('stf',   tests.create_user('ops-staff@example.test', 'Ravi Staff'));
insert into ctx values ('alice', tests.create_user('ops-alice@example.test', 'Alice Kumar'));
insert into ctx values ('bowner', tests.create_user('ops-bowner@example.test', 'Other Owner'));
update public.profiles set phone = '+919845011111' where id = (select v from ctx where k = 'alice');

-- vendor A: a hall with a resource, a van, and a staff login
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('org', public.create_organization('Ops Test Mantapa', tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-ops-0001'));
update public.business_profiles set description = 'Test hall', contact_phone = '+919845000001' where organization_id = (select v from ctx where k = 'org');
insert into public.services (organization_id, service_category_id, slug, title, status, price_type, price_unit, base_price_paise, city_id, created_by)
values ((select v from ctx where k = 'org'), (select id from public.service_categories where slug = 'kalyana-mantapa'), '',
        'Ops Hall', 'published', 'starting_from', 'per_day', 10000000, tests.city_id('kalaburagi'), (select v from ctx where k = 'owner'));
insert into ctx select 'svc', id from public.services where title = 'Ops Hall';
insert into public.bookable_resources (organization_id, kind, name, service_id)
values ((select v from ctx where k = 'org'), 'venue_space', 'Ops hall space', (select v from ctx where k = 'svc'));
insert into public.bookable_resources (organization_id, kind, name)
values ((select v from ctx where k = 'org'), 'equipment', 'Ops van');
insert into ctx select 'van', id from public.bookable_resources where name = 'Ops van';

-- vendor B
select tests.login_as((select v from ctx where k = 'bowner'));
insert into ctx values ('orgb', public.create_organization('Ops Other Caterers', tests.category_id('catering'), tests.city_id('kalaburagi'), 'test-idem-ops-0002'));

select tests.logout();
insert into public.organization_members (organization_id, user_id, role)
values ((select v from ctx where k = 'org'), (select v from ctx where k = 'stf'), 'staff');
insert into ctx select 'stf_member', id from public.organization_members where user_id = (select v from ctx where k = 'stf');
insert into ctx select 'bowner_member', id from public.organization_members where user_id = (select v from ctx where k = 'bowner');

-- ---------- roster -----------------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'owner'));
insert into public.staff_profiles (organization_id, member_id, full_name, phone, skill, day_rate_paise, created_by)
values ((select v from ctx where k = 'org'), (select v from ctx where k = 'stf_member'), 'Ravi Staff', '+919845022222', 'Head cook', 150000,
        (select v from ctx where k = 'owner'));
insert into public.staff_profiles (organization_id, full_name, skill, created_by)
values ((select v from ctx where k = 'org'), 'Meena Artist', 'Makeup', (select v from ctx where k = 'owner'));
insert into ctx select 's1', id from public.staff_profiles where full_name = 'Ravi Staff';
insert into ctx select 's2', id from public.staff_profiles where full_name = 'Meena Artist';
insert into public.bookable_resources (organization_id, kind, name, staff_profile_id)
values ((select v from ctx where k = 'org'), 'artist', 'Meena (artist)', (select v from ctx where k = 's2'));
insert into ctx select 'artist', id from public.bookable_resources where name = 'Meena (artist)';

select is((select count(*)::int from public.staff_profiles where organization_id = (select v from ctx where k = 'org')), 2,
  'the owner sees the whole roster');
select throws_ok($$ insert into public.staff_profiles (organization_id, member_id, full_name, created_by)
                    values ((select v from ctx where k = 'org'), (select v from ctx where k = 'bowner_member'), 'Wrong', (select v from ctx where k = 'owner')) $$,
  '23514', null, 'a login from another business cannot be linked');
select throws_ok($$ insert into public.bookable_resources (organization_id, kind, name, staff_profile_id)
                    values ((select v from ctx where k = 'org'), 'venue_space', 'Hall as person', (select v from ctx where k = 's1')) $$,
  '23514', null, 'only artist or team resources can be linked to staff');

select tests.login_as((select v from ctx where k = 'bowner'));
select is_empty($$ select 1 from public.staff_profiles where organization_id = (select v from ctx where k = 'org') $$,
  'another business cannot see the roster');
select throws_ok($$ insert into public.staff_profiles (organization_id, full_name, created_by)
                    values ((select v from ctx where k = 'org'), 'Intruder', (select v from ctx where k = 'bowner')) $$,
  '42501', null, 'another business cannot add staff');

select tests.login_as((select v from ctx where k = 'stf'));
select results_eq($$ select full_name from public.staff_profiles $$, $$ values ('Ravi Staff') $$,
  'a staff login sees only their own profile');
select is((select count(*)::int from public.staff_profiles where full_name = 'Ravi Staff'), 1, 'and can read it');
update public.staff_profiles set day_rate_paise = 999999;
select is((select day_rate_paise from public.staff_profiles where full_name = 'Ravi Staff'), 150000::bigint, 'staff cannot change their own day rate');

select tests.login_as((select v from ctx where k = 'alice'));
select is_empty($$ select 1 from public.staff_profiles $$, 'customers cannot see any roster');

-- ---------- a confirmed booking ---------------------------------------------------------------------
insert into ctx values ('enq', public.create_enquiry((select v from ctx where k = 'svc'), current_date + 40, '10:00', '22:00', 300, null, 'test-ops-alice-001'));
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('quote', public.send_quotation((select v from ctx where k = 'enq'),
  '[{"description":"Hall for the day","quantity":1,"unit_price_paise":10000000}]'::jsonb, 0, 0, 48, null, null));
select tests.login_as((select v from ctx where k = 'alice'));
select public.respond_quotation((select v from ctx where k = 'quote'), true);
insert into ctx values ('item', public.create_booking((select v from ctx where k = 'enq'), 'test-ops-book-0001'));

select tests.login_as((select v from ctx where k = 'owner'));
select throws_ok($$ select public.ensure_job((select v from ctx where k = 'item'), null) $$, '22023', null,
  'a booking waiting for its advance cannot be staffed yet');
insert into ctx values ('pay1', public.record_offline_payment((select v from ctx where k = 'item'), 2500000, 'cash', null, null, 'test-ops-pay-0001'));
select matches((select receipt_number from public.payments where id = (select v from ctx where k = 'pay1')),
  '^RCPT-[0-9]{4}-[0-9]{2}-0001$$', 'the first paid payment gets receipt number 0001 of the financial year');

insert into ctx values ('job1', public.ensure_job((select v from ctx where k = 'item'), null));
select is(public.ensure_job((select v from ctx where k = 'item'), null), (select v from ctx where k = 'job1'),
  'ensuring the job again returns the same job');
select is((select title from public.jobs where id = (select v from ctx where k = 'job1')), 'Ops Hall', 'the job is titled after the listing');

select tests.login_as((select v from ctx where k = 'stf'));
select throws_ok($$ select public.ensure_job((select v from ctx where k = 'item'), null) $$, 'P0002', null, 'staff cannot create jobs');
select throws_ok($$ select public.assign_staff((select v from ctx where k = 'job1'), (select v from ctx where k = 's1')) $$,
  'P0002', null, 'staff cannot assign themselves');

-- ---------- assignments ---------------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('a1', public.assign_staff((select v from ctx where k = 'job1'), (select v from ctx where k = 's1'), 'Head cook', null, 200000));
select throws_ok($$ select public.assign_staff((select v from ctx where k = 'job1'), (select v from ctx where k = 's1')) $$,
  '23505', null, 'the same person cannot be assigned twice');
select throws_ok($$ select public.assign_staff((select v from ctx where k = 'job1'), (select v from ctx where k = 's2'), null,
                      (select lower(period) - interval '2 days' from public.jobs where id = (select v from ctx where k = 'job1')), null) $$,
  '22023', null, 'a call time more than a day before the job is refused');

-- an offline booking at the same time, on the van
insert into ctx select 'off', id from public.reserve_resource((select v from ctx where k = 'van'),
  (select lower(period) from public.jobs where id = (select v from ctx where k = 'job1')),
  (select upper(period) from public.jobs where id = (select v from ctx where k = 'job1')),
  'offline', 'confirmed', 1, null, 'Phone booking: Patil family', 'test-ops-off-0001');
insert into ctx values ('job2', public.ensure_job(null, (select v from ctx where k = 'off')));
select is((select instructions from public.jobs where id = (select v from ctx where k = 'job2')), 'Phone booking: Patil family',
  'an offline job starts with the booking''s notes as instructions');
select throws_ok($$ select public.assign_staff((select v from ctx where k = 'job2'), (select v from ctx where k = 's1')) $$,
  '23P01', null, 'a staff member cannot be on two jobs at the same time');

-- an artist with their own calendar is reserved too
insert into ctx values ('a2', public.assign_staff((select v from ctx where k = 'job1'), (select v from ctx where k = 's2'), 'Bridal makeup', null, null));
insert into ctx select 'a2rsv', staff_reservation_id from public.job_assignments where id = (select v from ctx where k = 'a2');
select is((select status::text from public.resource_reservations where id = (select v from ctx where k = 'a2rsv')), 'confirmed',
  'assigning an artist reserves their own resource');
select throws_ok($$ select public.reserve_resource((select v from ctx where k = 'artist'),
                      (select lower(period) from public.jobs where id = (select v from ctx where k = 'job1')),
                      (select upper(period) from public.jobs where id = (select v from ctx where k = 'job1')),
                      'manual_block', 'blocked') $$,
  '23P01', null, 'the artist cannot be double-booked while on the job');
select throws_ok($$ select public.release_reservation((select v from ctx where k = 'a2rsv')) $$, '42501', null,
  'a staff job''s reservation cannot be released from the calendar');

select is((select count(*)::int from public.notifications where user_id = (select v from ctx where k = 'stf') and kind = 'job.assigned'), 0,
  'notifications are private to their owner');
select tests.logout();
select is((select count(*)::int from public.notifications where user_id = (select v from ctx where k = 'stf') and kind = 'job.assigned'), 1,
  'the staff login is notified of the new job');

-- ---------- the staff job view ------------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'stf'));
select results_eq($$ select title, customer_name, customer_phone, pay_paise, role_label from public.my_jobs() $$,
  $$ values ('Ops Hall'::text, 'Alice'::text, null::text, 200000::bigint, 'Head cook'::text) $$,
  'staff see the job, the customer''s first name and their own pay, but no phone weeks before the job');
select is_empty($$ select 1 from public.booking_items $$, 'staff cannot read bookings');
select is_empty($$ select 1 from public.payments $$, 'staff cannot read payments');
select is_empty($$ select 1 from public.vendor_expenses $$, 'staff cannot read expenses');
select is((select count(*)::int from public.job_assignments), 1, 'staff see only their own assignment');
select is(public.respond_job((select v from ctx where k = 'a1'), 'accept'), 'accepted'::public.job_assignment_status, 'staff accept the job');
select is(public.respond_job((select v from ctx where k = 'a1'), 'accept'), 'accepted'::public.job_assignment_status, 'accepting twice is harmless');
select throws_ok($$ select public.respond_job((select v from ctx where k = 'a1'), 'check_in') $$, '22023', null,
  'check-in is not open weeks before the job');
select throws_ok($$ select public.respond_job((select v from ctx where k = 'a2'), 'accept') $$, 'P0002', null,
  'staff cannot answer someone else''s assignment');

-- move the job close: the phone appears and check-in opens
select tests.logout();
update public.jobs set period = tstzrange(now() + interval '1 day', now() + interval '1 day 4 hours') where id = (select v from ctx where k = 'job1');
select tests.login_as((select v from ctx where k = 'stf'));
select is((select customer_phone from public.my_jobs() where job_id = (select v from ctx where k = 'job1')), '+919845011111',
  'the customer''s phone is shown from two days before the job');
select is(public.respond_job((select v from ctx where k = 'a1'), 'check_in', 'Reached the hall'), 'checked_in'::public.job_assignment_status,
  'staff check in on the job day');
select throws_ok($$ select public.respond_job((select v from ctx where k = 'a1'), 'complete') $$, '22023', null,
  'a job cannot be completed before it starts');
select tests.logout();
update public.jobs set period = tstzrange(now() - interval '1 hour', now() + interval '3 hours') where id = (select v from ctx where k = 'job1');
select tests.login_as((select v from ctx where k = 'stf'));
select is(public.respond_job((select v from ctx where k = 'a1'), 'complete'), 'completed'::public.job_assignment_status, 'staff complete the job');

-- decline: the owner is told
select tests.login_as((select v from ctx where k = 'owner'));
insert into ctx values ('a3', public.assign_staff((select v from ctx where k = 'job2'), (select v from ctx where k = 's1')));
select tests.login_as((select v from ctx where k = 'stf'));
select is(public.respond_job((select v from ctx where k = 'a3'), 'decline', 'Unwell'), 'declined'::public.job_assignment_status, 'staff can decline');
select tests.logout();
select is((select count(*)::int from public.notifications where user_id = (select v from ctx where k = 'owner') and kind = 'job.declined'), 1,
  'the owner is notified of the decline');

-- unassign releases the artist
select tests.login_as((select v from ctx where k = 'owner'));
select public.unassign_staff((select v from ctx where k = 'a2'));
select is((select status::text from public.resource_reservations where id = (select v from ctx where k = 'a2rsv')), 'released',
  'unassigning releases the artist''s reservation');

-- ---------- expenses -------------------------------------------------------------------------------------
insert into public.vendor_expenses (organization_id, category, amount_paise, spent_on, payee, created_by)
values ((select v from ctx where k = 'org'), 'materials', 50000, current_date, 'Flower market', (select v from ctx where k = 'owner'));
insert into public.vendor_expenses (organization_id, category, amount_paise, spent_on, assignment_id, created_by)
values ((select v from ctx where k = 'org'), 'other', 200000, current_date, (select v from ctx where k = 'a1'), (select v from ctx where k = 'owner'));
select results_eq($$ select category::text, booking_item_id from public.vendor_expenses where assignment_id = (select v from ctx where k = 'a1') $$,
  $$ values ('staff_payout'::text, (select v from ctx where k = 'item')) $$,
  'a staff payout is categorised and linked to the booking automatically');
select throws_ok($$ insert into public.vendor_expenses (organization_id, category, amount_paise, spent_on, assignment_id, created_by)
                    values ((select v from ctx where k = 'org'), 'staff_payout', 1000, current_date, (select v from ctx where k = 'a1'), (select v from ctx where k = 'owner')) $$,
  '23505', null, 'an assignment is paid out only once');

select tests.login_as((select v from ctx where k = 'bowner'));
select is_empty($$ select 1 from public.vendor_expenses where organization_id = (select v from ctx where k = 'org') $$,
  'another business cannot see the expenses');
select throws_ok($$ select public.vendor_report((select v from ctx where k = 'org'), current_date - 30, current_date + 60) $$,
  '42501', null, 'another business cannot run the reports');
select tests.login_as((select v from ctx where k = 'stf'));
select throws_ok($$ insert into public.vendor_expenses (organization_id, category, amount_paise, spent_on, created_by)
                    values ((select v from ctx where k = 'org'), 'other', 100, current_date, (select v from ctx where k = 'stf')) $$,
  '42501', null, 'staff cannot record expenses');
select throws_ok($$ select public.vendor_report((select v from ctx where k = 'org'), current_date - 30, current_date + 60) $$,
  '42501', null, 'staff cannot run the reports');

-- ---------- reports & receipts -----------------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'owner'));
select results_eq(
  $$ select (r #>> '{totals,received_paise}')::bigint, (r #>> '{totals,expenses_paise}')::bigint,
            (r #>> '{totals,booked_value_paise}')::bigint, (r #>> '{totals,outstanding_paise}')::bigint
     from public.vendor_report((select v from ctx where k = 'org'), current_date - 30, current_date + 60) r $$,
  $$ values (2500000::bigint, 250000::bigint, 10000000::bigint, 7500000::bigint) $$,
  'the report totals money received, expenses, booked value and what customers still owe');
select is((select jsonb_array_length(r -> 'staff') from public.vendor_report((select v from ctx where k = 'org'), current_date - 30, current_date + 60) r), 2,
  'the report lists every staff member');
select throws_ok($$ select public.vendor_report((select v from ctx where k = 'org'), current_date, current_date - 1) $$,
  '22023', null, 'a reversed range is refused');

select is((public.payment_receipt((select v from ctx where k = 'pay1')) #>> '{booking,balance_after_paise}')::bigint, 7500000::bigint,
  'the vendor''s receipt shows the balance after this payment');
select tests.login_as((select v from ctx where k = 'alice'));
select is(public.payment_receipt((select v from ctx where k = 'pay1')) ->> 'customer', '{"name": "Alice Kumar", "email": "ops-alice@example.test", "phone": "+919845011111"}',
  'the customer can open their receipt');
select tests.login_as((select v from ctx where k = 'stf'));
select throws_ok($$ select public.payment_receipt((select v from ctx where k = 'pay1')) $$, 'P0002', null, 'staff cannot open receipts');
select tests.login_as((select v from ctx where k = 'bowner'));
select throws_ok($$ select public.payment_receipt((select v from ctx where k = 'pay1')) $$, 'P0002', null, 'another business cannot open the receipt');

select tests.logout();
select is(private.fiscal_year('2027-03-31 18:29:00+00'), '2026-27', '23:59 IST on 31 March is still the old financial year');
select is(private.fiscal_year('2027-03-31 18:31:00+00'), '2027-28', '00:01 IST on 1 April starts the new financial year');

-- ---------- cancellation cascades ----------------------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'owner'));
select lives_ok($$ select public.release_reservation((select v from ctx where k = 'off')) $$, 'the owner releases the offline booking');
select is((select status from public.jobs where id = (select v from ctx where k = 'job2')), 'cancelled',
  'releasing an offline booking cancels its job');

insert into ctx values ('a4', public.assign_staff((select v from ctx where k = 'job1'), (select v from ctx where k = 's2')));
insert into ctx select 'a4rsv', staff_reservation_id from public.job_assignments where id = (select v from ctx where k = 'a4');
select is(public.cancel_booking_item((select v from ctx where k = 'item'), 'Hall under repair'), 2500000::bigint, 'the vendor cancels; the full advance is due back');
select results_eq($$ select j.status, a.status::text from public.jobs j join public.job_assignments a on a.job_id = j.id
                     where a.id = (select v from ctx where k = 'a4') $$,
  $$ values ('cancelled'::text, 'cancelled'::text) $$, 'cancelling the booking cancels its job and open assignments');
select is((select status::text from public.resource_reservations where id = (select v from ctx where k = 'a4rsv')), 'released',
  'and releases the artist');
select is((select status::text from public.job_assignments where id = (select v from ctx where k = 'a1')), 'completed',
  'completed work stays completed');

-- ---------- report scope: a branch manager sees only their branch ------------------------------------------
select tests.logout();
insert into ctx values ('mgr', tests.create_user('ops-manager@example.test', 'Branch Manager'));
insert into public.branches (organization_id, name) values ((select v from ctx where k = 'org'), 'Ops Second Branch');
insert into ctx select 'br2', id from public.branches where name = 'Ops Second Branch';
insert into public.organization_members (organization_id, user_id, role)
values ((select v from ctx where k = 'org'), (select v from ctx where k = 'mgr'), 'branch_manager');
insert into public.member_branch_access (member_id, branch_id, organization_id)
select m.id, (select v from ctx where k = 'br2'), m.organization_id from public.organization_members m where m.user_id = (select v from ctx where k = 'mgr');
insert into public.vendor_expenses (organization_id, branch_id, category, amount_paise, spent_on, created_by)
values ((select v from ctx where k = 'org'), (select v from ctx where k = 'br2'), 'transport', 70000, current_date, (select v from ctx where k = 'owner'));

select tests.login_as((select v from ctx where k = 'mgr'));
select is((public.vendor_report((select v from ctx where k = 'org'), current_date - 30, current_date + 60) #>> '{totals,expenses_paise}')::bigint,
  70000::bigint, 'a branch manager''s report counts only their branch');
select tests.login_as((select v from ctx where k = 'owner'));
select is((public.vendor_report((select v from ctx where k = 'org'), current_date - 30, current_date + 60) #>> '{totals,expenses_paise}')::bigint,
  320000::bigint, 'the owner''s report counts every branch');

select tests.login_anon();
select throws_ok($$ select * from public.my_jobs() $$, '42501', null, 'anonymous visitors cannot call the job list');

select * from finish();
rollback;
