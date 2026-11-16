-- Roadmap Phase B batch 2: packages (C6/V4), "get 3 quotes" (C3), event quote comparison (C5).
begin;
\ir 00_helpers.sql.inc

select plan(20);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to anon, authenticated;
create temp table d (k text primary key, v date) on commit drop;
grant all on d to anon, authenticated;
insert into d values ('day', current_date + 50);

insert into ctx values ('o1', tests.create_user('b2-o1@example.test', 'Owner One'));
insert into ctx values ('o2', tests.create_user('b2-o2@example.test', 'Owner Two'));
insert into ctx values ('o3', tests.create_user('b2-o3@example.test', 'Owner Three'));
insert into ctx values ('cust', tests.create_user('b2-cust@example.test', 'Asha Customer'));
insert into ctx values ('eve', tests.create_user('b2-eve@example.test', 'Eve Outsider'));

-- Three verified hall vendors in Kalaburagi; hall 3 is booked on the day.
do $$
declare
  i int;
  v_org uuid;
begin
  for i in 1..3 loop
    perform tests.login_as((select v from ctx where k = 'o' || i));
    v_org := public.create_organization('B2 Hall Co ' || i, tests.category_id('venues'), tests.city_id('kalaburagi'), 'test-idem-b2-org-' || i);
    insert into ctx values ('org' || i, v_org);
    perform tests.verify_org(v_org);
    update public.business_profiles set description = 'Hall', contact_phone = '+91984500010' || i where organization_id = v_org;
    insert into public.services (organization_id, service_category_id, slug, title, status, price_type, price_unit, base_price_paise,
                                 city_id, max_guests, created_by)
    values (v_org, (select id from public.service_categories where slug = 'kalyana-mantapa'), '', 'B2 Hall ' || i, 'published',
            'starting_from', 'per_day', 10000000 + i * 100000, tests.city_id('kalaburagi'), 800, (select v from ctx where k = 'o' || i));
    insert into ctx select 'svc' || i, id from public.services where title = 'B2 Hall ' || i;
    insert into public.bookable_resources (organization_id, kind, name, service_id)
    values (v_org, 'venue_space', 'B2 space ' || i, (select v from ctx where k = 'svc' || i));
  end loop;
  perform tests.logout();
end $$;
insert into public.resource_reservations (resource_id, organization_id, period, status, source)
select r.id, r.organization_id,
       tstzrange(((select v from d) + time '09:00') at time zone 'Asia/Kolkata', ((select v from d) + time '23:00') at time zone 'Asia/Kolkata', '[)'),
       'blocked', 'manual_block'
from public.bookable_resources r where r.name = 'B2 space 3';

-- ---------- C6/V4: packages -------------------------------------------------------------
select tests.login_as((select v from ctx where k = 'o1'));
insert into public.service_packages (organization_id, service_id, name, price_paise, price_unit, includes, excludes, created_by)
values ((select v from ctx where k = 'org1'), (select v from ctx where k = 'svc1'), 'Gold', 25000000, null,
        array['Hall for 12 hours', '300 veg plates'], array['Nadaswaram'], (select v from ctx where k = 'o1'));
select is((select count(*)::int from public.service_packages where service_id = (select v from ctx where k = 'svc1')), 1,
  'the owner adds a package to their listing');
select throws_ok($$ insert into public.service_packages (organization_id, service_id, name, price_paise, created_by)
                    values ((select v from ctx where k = 'org2'), (select v from ctx where k = 'svc2'), 'Sneaky', 1,
                            (select v from ctx where k = 'o1')) $$,
  '42501', null, 'nobody adds packages to another vendor''s listing');
select throws_ok($$ insert into public.service_packages (organization_id, service_id, name, price_paise, includes, created_by)
                    values ((select v from ctx where k = 'org1'), (select v from ctx where k = 'svc1'), 'Too long', 1,
                            array[repeat('x', 81)], (select v from ctx where k = 'o1')) $$,
  '23514', null, 'include lines are limited to 80 characters');
insert into public.service_packages (organization_id, service_id, name, price_paise, created_by)
select (select v from ctx where k = 'org1'), (select v from ctx where k = 'svc1'), 'P' || g, 100, (select v from ctx where k = 'o1')
from generate_series(2, 6) g;
select throws_ok($$ insert into public.service_packages (organization_id, service_id, name, price_paise, created_by)
                    values ((select v from ctx where k = 'org1'), (select v from ctx where k = 'svc1'), 'Seventh', 1,
                            (select v from ctx where k = 'o1')) $$,
  '23514', null, 'a listing shows at most 6 packages');

select tests.login_as((select v from ctx where k = 'o2'));
select is((select count(*)::int from public.service_packages), 0, 'other vendors cannot read the table directly');
select tests.login_anon();
select is((select name from public.listing_packages((select v from ctx where k = 'svc1')) order by price_paise desc limit 1), 'Gold',
  'visitors see a live listing''s packages');
select is((select includes from public.listing_packages((select v from ctx where k = 'svc1')) where name = 'Gold'),
  array['Hall for 12 hours', '300 veg plates'], 'with what is included');
select tests.logout();
update public.organizations set status = 'draft' where id = (select v from ctx where k = 'org1');
select tests.login_anon();
select is((select count(*)::int from public.listing_packages((select v from ctx where k = 'svc1'))), 0,
  'a vendor that is not live shows no packages');
select tests.logout();
update public.organizations set status = 'active' where id = (select v from ctx where k = 'org1');

-- ---------- C3: similar available listings --------------------------------------------
select tests.login_as((select v from ctx where k = 'cust'));
select is((select array_agg(title order by title) from public.similar_available_services(
            (select v from ctx where k = 'svc1'), (select v from d), '10:00', '22:00', 300, 5) where title like 'B2 Hall%'),
  array['B2 Hall 2'], 'similar = same category and city, free that day (hall 3 is booked)');
select is((select count(*)::int from public.similar_available_services(
            (select v from ctx where k = 'svc1'), (select v from d), '10:00', '22:00', 900, 5) where title like 'B2 Hall%'), 0,
  'listings that can''t host the guest count are left out');
select tests.login_as((select v from ctx where k = 'o2'));
select is((select count(*)::int from public.similar_available_services(
            (select v from ctx where k = 'svc1'), (select v from d), '10:00', '22:00', 300, 2)
           where id = (select v from ctx where k = 'svc2')), 0,
  'a vendor is never offered their own listing');

-- ---------- C5: compare and accept within an event ------------------------------------
select tests.login_as((select v from ctx where k = 'cust'));
insert into ctx values ('event', public.create_event('Asha weds Ravi', 'wedding', tests.city_id('kalaburagi'),
                                                    (select v from d), null, 300, 'test-b2-event-0001'));
insert into ctx values ('e1', public.create_enquiry((select v from ctx where k = 'svc1'), (select v from d), '10:00', '22:00', 300, null, 'test-b2-enq-0001'));
insert into ctx values ('e2', public.create_enquiry((select v from ctx where k = 'svc2'), (select v from d), '10:00', '22:00', 300, null, 'test-b2-enq-0002'));
select public.set_enquiry_event((select v from ctx where k = 'e1'), (select v from ctx where k = 'event'));
select public.set_enquiry_event((select v from ctx where k = 'e2'), (select v from ctx where k = 'event'));

select tests.login_as((select v from ctx where k = 'o1'));
insert into ctx values ('q1', public.send_quotation((select v from ctx where k = 'e1'),
  '[{"description":"Gold","quantity":1,"unit_price_paise":25000000}]'::jsonb, 0, 0, 48, 'Includes: Hall for 12 hours', null));
select tests.login_as((select v from ctx where k = 'o2'));
insert into ctx values ('q2', public.send_quotation((select v from ctx where k = 'e2'),
  '[{"description":"Hall","quantity":1,"unit_price_paise":22000000}]'::jsonb, 0, 0, 48, null, null));

select tests.login_as((select v from ctx where k = 'cust'));
select is((select count(*)::int from public.event_quote_options((select v from ctx where k = 'event'))), 2,
  'both quotes appear in the event comparison');
select is((select (items -> 0 ->> 'description') from public.event_quote_options((select v from ctx where k = 'event'))
           where quotation_id = (select v from ctx where k = 'q1')), 'Gold', 'with their quoted lines');
select is((select bool_and(is_owner) from public.event_quote_options((select v from ctx where k = 'event'))), true,
  'the event owner can accept');
select tests.login_as((select v from ctx where k = 'eve'));
select throws_ok($$ select * from public.event_quote_options((select v from ctx where k = 'event')) $$,
  'P0002', null, 'outsiders cannot see an event''s quotes');
select throws_ok($$ select public.accept_event_quote((select v from ctx where k = 'q1'), 'thanks') $$,
  'P0002', null, 'and cannot accept them');

select tests.login_as((select v from ctx where k = 'cust'));
select is(public.accept_event_quote((select v from ctx where k = 'q2'), 'Thank you, we chose another vendor.'), 1,
  'accepting one quote withdraws the other request in that category');
select tests.logout();
select is((select status::text from public.enquiries where id = (select v from ctx where k = 'e2')), 'accepted',
  'the chosen request is accepted');
select is((select status::text from public.enquiries where id = (select v from ctx where k = 'e1')), 'cancelled',
  'the other is withdrawn and its date released');
select is((select body from public.enquiry_messages where enquiry_id = (select v from ctx where k = 'e1') order by created_at desc limit 1),
  'Thank you, we chose another vendor.', 'with a note to that vendor first');

select * from finish();
rollback;
