-- =============================================================================
-- 0400 · Taxonomy: business & service categories, cities, areas,
--        auspicious dates (enhancement B)
-- Categories are DB-driven (D4). The full list below is reference data needed
-- in every environment, so it lives in a migration (not in seed.sql).
-- name_i18n holds {"kn": "...", "hi": "..."}; translations need native review
-- before launch and are intentionally left empty here.
-- =============================================================================

create table public.business_categories (
  id                 uuid primary key default extensions.gen_random_uuid(),
  slug               extensions.citext not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name               text not null,
  name_i18n          jsonb not null default '{}'::jsonb check (jsonb_typeof(name_i18n) = 'object'),
  description        text,
  icon               text,                                  -- lucide icon name
  display_order      int  not null default 0,
  is_launch_focus    boolean not null default false,        -- D4 polished-first categories
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.service_categories (
  id                    uuid primary key default extensions.gen_random_uuid(),
  business_category_id  uuid not null references public.business_categories (id) on delete restrict,
  parent_id             uuid references public.service_categories (id) on delete restrict,
  slug                  extensions.citext not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                  text not null,
  name_i18n             jsonb not null default '{}'::jsonb check (jsonb_typeof(name_i18n) = 'object'),
  description           text,
  -- JSON Schema used to validate category-specific service attributes (Phase 3).
  attribute_schema      jsonb not null default '{}'::jsonb check (jsonb_typeof(attribute_schema) = 'object'),
  default_booking_mode  public.booking_mode not null default 'request',
  resource_kind_hint    public.resource_kind,
  display_order         int not null default 0,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index service_categories_business_category_idx on public.service_categories (business_category_id);
create index service_categories_parent_idx on public.service_categories (parent_id);

create table public.cities (
  id          uuid primary key default extensions.gen_random_uuid(),
  slug        extensions.citext not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  name_i18n   jsonb not null default '{}'::jsonb check (jsonb_typeof(name_i18n) = 'object'),
  alt_names   text[] not null default '{}',
  state       text not null,
  state_code  char(2) not null,
  country     char(2) not null default 'IN',
  timezone    text not null default 'Asia/Kolkata',
  is_launch_city boolean not null default false,   -- D7: decision pending
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.areas (
  id          uuid primary key default extensions.gen_random_uuid(),
  city_id     uuid not null references public.cities (id) on delete restrict,
  slug        extensions.citext not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  name_i18n   jsonb not null default '{}'::jsonb check (jsonb_typeof(name_i18n) = 'object'),
  pincode     text check (pincode ~ '^[1-9][0-9]{5}$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (city_id, slug)
);

-- Enhancement B: admin-managed auspicious dates (not computed panchang).
create table public.auspicious_dates (
  id            uuid primary key default extensions.gen_random_uuid(),
  date          date not null,
  city_id       uuid references public.cities (id) on delete cascade,   -- null = applies everywhere
  tradition     text not null default 'general' check (tradition ~ '^[a-z_]{2,40}$'),
  title         text not null,
  title_i18n    jsonb not null default '{}'::jsonb check (jsonb_typeof(title_i18n) = 'object'),
  notes         text,
  significance  smallint not null default 2 check (significance between 1 and 3),  -- 1 low · 3 peak demand
  -- [{ "start": "06:30", "end": "08:15", "label": "..." }]  local times
  muhurtham_windows jsonb not null default '[]'::jsonb check (jsonb_typeof(muhurtham_windows) = 'array'),
  source        text,                       -- who/what verified the date
  is_published  boolean not null default false,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index auspicious_dates_unique
  on public.auspicious_dates (date, coalesce(city_id, '00000000-0000-0000-0000-000000000000'::uuid), tradition);
create index auspicious_dates_date_idx on public.auspicious_dates (date) where is_published;

-- updated_at triggers
create trigger business_categories_set_updated_at before update on public.business_categories for each row execute function public.set_updated_at();
create trigger service_categories_set_updated_at  before update on public.service_categories  for each row execute function public.set_updated_at();
create trigger cities_set_updated_at              before update on public.cities              for each row execute function public.set_updated_at();
create trigger areas_set_updated_at               before update on public.areas               for each row execute function public.set_updated_at();
create trigger auspicious_dates_set_updated_at    before update on public.auspicious_dates    for each row execute function public.set_updated_at();

-- ---------- reference data: business categories ------------------------------
insert into public.business_categories (slug, name, description, icon, display_order, is_launch_focus) values
  ('venues',              'Venues',                   'Kalyana mantapas, marriage & function halls, banquets and lawns', 'landmark',     10, true),
  ('catering',            'Catering',                 'Veg, non-veg and traditional meal services',                     'utensils',     20, true),
  ('decoration',          'Decoration',               'Mandap, stage, floral and theme décor',                          'flower-2',     30, true),
  ('photography',         'Photography & Video',      'Wedding photography, candid and cinematic video',               'camera',       40, false),
  ('makeup',              'Makeup & Hair',            'Bridal and party makeup, hair styling and draping',             'sparkles',     50, false),
  ('mehendi',             'Mehendi',                  'Bridal and guest mehendi artists',                               'hand',         60, false),
  ('music-entertainment', 'Music & Entertainment',    'Nadaswaram, DJs, bands, anchors and performers',                'music',        70, false),
  ('priests-rituals',     'Priests & Rituals',        'Purohits and pooja services for every ceremony',                'flame',        80, false),
  ('invitations',         'Invitations',              'Printed and digital invitations',                               'mail',         90, false),
  ('planning',            'Event Planning',           'Wedding planners and event coordinators',                       'clipboard-list',100, false),
  ('rentals',             'Rentals & Equipment',      'Shamiana, furniture, sound, lighting and power backup',         'tent',        110, false),
  ('cakes-sweets',        'Cakes & Sweets',           'Wedding cakes, sweets and mithai',                              'cake',        120, false),
  ('transport',           'Transport',                'Guest transport, vintage cars and baraat',                      'car',         130, false),
  ('gifts',               'Gifts & Return Gifts',     'Return gifts, hampers and favours',                             'gift',        140, false),
  ('attire',              'Attire & Jewellery',       'Bridal wear, groom wear and jewellery rental',                  'shirt',       150, false);

-- ---------- reference data: service categories -------------------------------
insert into public.service_categories (business_category_id, slug, name, resource_kind_hint, display_order)
select bc.id, v.slug, v.name, v.kind::public.resource_kind, v.ord
from (values
  -- venues
  ('venues', 'kalyana-mantapa',        'Kalyana Mantapa',               'venue_space', 10),
  ('venues', 'marriage-hall',          'Marriage / Function Hall',      'venue_space', 20),
  ('venues', 'banquet-hall',           'Banquet Hall',                  'venue_space', 30),
  ('venues', 'convention-centre',      'Convention Centre',             'venue_space', 40),
  ('venues', 'lawn-garden',            'Lawn & Garden',                 'venue_space', 50),
  ('venues', 'resort-venue',           'Resort',                        'venue_space', 60),
  ('venues', 'hotel-banquet',          'Hotel Banquet',                 'venue_space', 70),
  ('venues', 'community-hall',         'Community Hall',                'venue_space', 80),
  ('venues', 'farmhouse',              'Farmhouse',                     'venue_space', 90),
  ('venues', 'rooftop-venue',          'Rooftop Venue',                 'venue_space', 100),
  -- catering
  ('catering', 'veg-catering',             'Veg Catering',                        'team', 10),
  ('catering', 'non-veg-catering',         'Non-veg Catering',                    'team', 20),
  ('catering', 'south-indian-traditional', 'Traditional South Indian (Bale Ele Oota)', 'team', 30),
  ('catering', 'north-indian-catering',    'North Indian Catering',               'team', 40),
  ('catering', 'live-counters',            'Live Counters',                       'team', 50),
  ('catering', 'snacks-tiffin',            'Snacks & Tiffin',                     'team', 60),
  ('catering', 'beverage-service',         'Beverage Service',                    'team', 70),
  -- decoration
  ('decoration', 'mandap-decoration',    'Mandap Decoration',        'team', 10),
  ('decoration', 'stage-decoration',     'Stage Decoration',         'team', 20),
  ('decoration', 'floral-decoration',    'Floral Decoration',        'team', 30),
  ('decoration', 'entrance-decoration',  'Entrance Décor',           'team', 40),
  ('decoration', 'theme-decoration',     'Theme Décor',              'team', 50),
  ('decoration', 'haldi-mehendi-decor',  'Haldi & Mehendi Décor',    'team', 60),
  ('decoration', 'car-decoration',       'Car Decoration',           'team', 70),
  ('decoration', 'balloon-decoration',   'Balloon Décor',            'team', 80),
  -- photography
  ('photography', 'wedding-photography',   'Wedding Photography',     'team', 10),
  ('photography', 'candid-photography',    'Candid Photography',      'artist', 20),
  ('photography', 'cinematic-videography', 'Cinematic Videography',   'team', 30),
  ('photography', 'pre-wedding-shoot',     'Pre-wedding Shoot',       'team', 40),
  ('photography', 'drone-coverage',        'Drone Coverage',          'equipment', 50),
  ('photography', 'photo-booth',           'Photo Booth',             'equipment', 60),
  ('photography', 'album-design',          'Album Design',            null, 70),
  -- makeup
  ('makeup', 'bridal-makeup',  'Bridal Makeup',   'artist', 10),
  ('makeup', 'party-makeup',   'Party Makeup',    'artist', 20),
  ('makeup', 'groom-styling',  'Groom Styling',   'artist', 30),
  ('makeup', 'hair-styling',   'Hair Styling',    'artist', 40),
  ('makeup', 'saree-draping',  'Saree Draping',   'artist', 50),
  -- mehendi
  ('mehendi', 'bridal-mehendi', 'Bridal Mehendi', 'artist', 10),
  ('mehendi', 'guest-mehendi',  'Guest Mehendi',  'artist', 20),
  ('mehendi', 'arabic-mehendi', 'Arabic Mehendi', 'artist', 30),
  -- music & entertainment
  ('music-entertainment', 'nadaswaram',          'Nadaswaram & Mangala Vadya', 'team',   10),
  ('music-entertainment', 'dj',                  'DJ',                          'artist', 20),
  ('music-entertainment', 'live-band',           'Live Band',                   'team',   30),
  ('music-entertainment', 'dhol',                'Dhol',                        'team',   40),
  ('music-entertainment', 'anchor-emcee',        'Anchor / Emcee',              'artist', 50),
  ('music-entertainment', 'dance-troupe',        'Dance Troupe',                'team',   60),
  ('music-entertainment', 'sangeet-choreography','Sangeet Choreography',        'artist', 70),
  ('music-entertainment', 'kids-entertainment',  'Kids Entertainment',          'artist', 80),
  -- priests & rituals
  ('priests-rituals', 'wedding-purohit',      'Wedding Purohit',       'artist', 10),
  ('priests-rituals', 'griha-pravesha-pooja', 'Griha Pravesha Pooja',  'artist', 20),
  ('priests-rituals', 'naming-ceremony-pooja','Naming Ceremony Pooja', 'artist', 30),
  ('priests-rituals', 'homa-havan',           'Homa / Havan',          'artist', 40),
  -- invitations
  ('invitations', 'printed-invitations', 'Printed Invitations', null, 10),
  ('invitations', 'digital-invitations', 'Digital Invitations', null, 20),
  -- planning
  ('planning', 'wedding-planner',     'Wedding Planner',     'team', 10),
  ('planning', 'event-coordinator',   'Event Coordinator',   'artist', 20),
  ('planning', 'destination-wedding', 'Destination Wedding', 'team', 30),
  -- rentals
  ('rentals', 'tent-shamiana',     'Tent & Shamiana',     'equipment', 10),
  ('rentals', 'furniture-rental',  'Furniture Rental',    'equipment', 20),
  ('rentals', 'crockery-rental',   'Crockery Rental',     'equipment', 30),
  ('rentals', 'sound-system',      'Sound System',        'equipment', 40),
  ('rentals', 'lighting-rental',   'Lighting',            'equipment', 50),
  ('rentals', 'led-wall',          'LED Wall',            'equipment', 60),
  ('rentals', 'generator-rental',  'Generator / Power Backup', 'equipment', 70),
  -- cakes & sweets
  ('cakes-sweets', 'wedding-cake',  'Wedding Cake',   null, 10),
  ('cakes-sweets', 'sweets-mithai', 'Sweets & Mithai', null, 20),
  -- transport
  ('transport', 'guest-transport', 'Guest Transport', 'equipment', 10),
  ('transport', 'vintage-car',     'Vintage / Wedding Car', 'equipment', 20),
  ('transport', 'horse-baraat',    'Horse & Baraat',  'team', 30),
  -- gifts
  ('gifts', 'return-gifts',  'Return Gifts',  null, 10),
  ('gifts', 'gift-hampers',  'Gift Hampers',  null, 20),
  -- attire
  ('attire', 'bridal-wear-rental', 'Bridal Wear Rental', null, 10),
  ('attire', 'groom-wear',         'Groom Wear',         null, 20),
  ('attire', 'jewellery-rental',   'Jewellery Rental',   null, 30)
) as v(category, slug, name, kind, ord)
join public.business_categories bc on bc.slug = v.category;

-- ---------- reference data: candidate launch cities (D7 pending) -------------
insert into public.cities (slug, name, alt_names, state, state_code) values
  ('kalaburagi', 'Kalaburagi', array['Gulbarga'],  'Karnataka', 'KA'),
  ('bengaluru',  'Bengaluru',  array['Bangalore'], 'Karnataka', 'KA');
