-- Tables for places, accessibility facts, travel times, profiles, trips and feedback.
--
-- Each accessibility fact is one row in place_accessibility, with its own source and
-- confidence. The row id is the fact_id that the LLM must cite. A fact with no row is
-- "unknown". Never insert a row without a source.

create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create type confidence_level as enum ('VERIFIED', 'COMMUNITY', 'INFERRED');

-- PLACES ---------------------------------------------------------------------

create table places (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,                -- 'san-diego-zoo'
  name              text not null,
  category          text not null check (category in (
                      'attraction', 'museum', 'beach', 'park', 'photo_spot',
                      'restaurant', 'cafe', 'dessert', 'shopping')),
  subcategories     text[] not null default '{}',        -- cuisine keys from dna.py, e.g. {'italian'}
  interest_tags     text[] not null default '{}',        -- Interest keys from dna.py
  neighborhood      text not null,                       -- cluster key, e.g. little_italy, balboa_park, la_jolla
  lat               double precision not null,
  lng               double precision not null,
  address           text,
  google_place_id   text unique,
  website           text,
  accessibility_url text,                                -- the official accessibility page
  data_tier         text not null check (data_tier in ('A', 'B', 'C')),  -- A phoned, B official page, C Google/OSM
  indoor            boolean,
  est_visit_min     int not null check (est_visit_min between 15 and 480),
  exertion_level    smallint not null check (exertion_level between 1 and 5),
  meal_slot         text check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  price_level       smallint check (price_level between 0 and 4),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index places_category_idx     on places (category) where is_active;
create index places_neighborhood_idx on places (neighborhood);
create index places_tier_idx         on places (data_tier);
create index places_interest_gin     on places using gin (interest_tags);

-- One row per (place, attribute, source). The id is the citable fact_id.
create table place_accessibility (
  id          bigserial primary key,
  place_id    uuid not null references places (id) on delete cascade,
  attribute   text not null check (attribute in (
    -- open status: open | closed | partial (detail names the closed areas and until when)
    'status',
    -- mobility
    'entrance_step_free', 'restroom_accessible', 'parking_accessible', 'dropoff_zone', 'elevator',
    'stairs', 'terrain', 'max_slope', 'typical_walk_m', 'standing_min', 'seating', 'shade',
    'wheelchair_rental', 'ecv_rental', 'beach_wheelchair', 'beach_mat', 'accessible_transit',
    -- blind and low vision
    'audio_description', 'braille_tactile', 'large_print', 'sighted_guide_on_request',
    'edge_hazard',                                       -- yes = unfenced cliffs or drop-offs
    'guide_dog_relief', 'service_animal_ok',
    -- deaf and hard of hearing
    'captions_asl', 'assistive_listening',
    -- sensory and cognitive
    'crowd_level', 'noise_level', 'quiet_space', 'sensory_kit')),
  value       text not null,       -- yes | no | partial, a level or enum, or an integer as text
  detail      text not null,       -- one sentence, shown in the UI and given to the LLM as is
  confidence  confidence_level not null,
  source      text not null check (source in (
                'official', 'phone_call', 'team_verified', 'wheelmap', 'osm', 'google_places',
                'community_feedback', 'photo_ai', 'inferred')),
  source_url  text,                -- for photo_ai: the image URL
  verified_at date,                -- for photo_ai: the image capture date
  unique (place_id, attribute, source),
  check (value <> 'unknown'),      -- unknown = no row
  check (source not in ('photo_ai', 'inferred') or confidence = 'INFERRED'),
  check (source <> 'photo_ai' or source_url is not null)
);
create index pa_place_idx on place_accessibility (place_id);
create index pa_attr_idx  on place_accessibility (attribute, value);

-- Entrance photos for the photo check (Mapillary images, CC BY-SA).
create table place_photos (
  id              bigserial primary key,
  place_id        uuid not null references places (id) on delete cascade,
  provider        text not null default 'mapillary' check (provider in ('mapillary')),
  image_id        text not null,
  image_url       text not null,
  captured_at     date,
  attribution     text not null,                 -- shown next to the photo
  ai_findings     jsonb,                         -- raw vision-model output
  review_status   text not null default 'pending' check (review_status in ('pending', 'confirmed', 'rejected')),
  reviewed_by     text,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (provider, image_id)
);
create index place_photos_place_idx on place_photos (place_id);

-- Travel times between tier A and B places (other legs use a distance estimate).
create table travel_cache (
  origin_id   uuid not null references places (id) on delete cascade,
  dest_id     uuid not null references places (id) on delete cascade,
  mode        text not null check (mode in ('drive', 'walk', 'transit')),
  minutes     int not null,
  meters      int not null,
  polyline    text,
  computed_at timestamptz not null default now(),
  primary key (origin_id, dest_id, mode)
);

-- PROFILES -------------------------------------------------------------------
-- The API uses one demo bearer token, not Supabase Auth, so user_id has no foreign key.

create table profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  raw_answers       jsonb not null,
  followup_qa       jsonb not null default '[]',
  dna               jsonb not null,                -- AccessibilityDNA from dna.py
  dna_vector        extensions.vector(16) not null,
  consent_aggregate boolean not null default false,
  trip_only         boolean not null default false, -- temporary needs: delete after the trip
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index profiles_user_idx on profiles (user_id);

-- TRIPS ----------------------------------------------------------------------

create table trips (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  profile_id      uuid not null references profiles (id) on delete cascade,
  start_date      date not null,
  nights          int not null check (nights between 1 and 7),
  travelers       int not null default 1 check (travelers between 1 and 20),
  lodging_name    text,
  lodging_lat     double precision,
  lodging_lng     double precision,
  transport_mode  text not null default 'drive' check (transport_mode in ('drive', 'transit', 'walk')),
  status          text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  current_version int not null default 1,
  dna_overrides   jsonb not null default '{}',     -- trip-only changes from feedback
  weather         jsonb,                           -- cached Open-Meteo daily forecast
  excluded        jsonb not null default '[]',     -- [{place_id, reasons[], fact_ids[]}] for "Places we skipped"
  overall_notes   text,
  created_at      timestamptz not null default now()
);
create index trips_user_idx on trips (user_id);

create table itinerary_items (
  id                   uuid primary key default gen_random_uuid(),
  trip_id              uuid not null references trips (id) on delete cascade,
  version              int not null,
  day_index            int not null,
  seq                  int not null,
  kind                 text not null check (kind in ('visit', 'meal', 'rest')),
  place_id             uuid references places (id),
  title                text not null,
  start_time           timestamptz not null,
  end_time             timestamptz not null,
  travel_min_from_prev int,
  travel_mode          text,
  travel_polyline      text,
  status               text not null default 'planned' check (status in ('planned', 'in_progress', 'done', 'skipped')),
  locked               boolean not null default false,
  rationale            text,                       -- LLM text, checked by the grounding validator
  fact_ids             bigint[] not null default '{}',
  warnings             text[] not null default '{}',
  insights             jsonb not null default '[]',
  score                real,
  replaced_item_id     uuid,                       -- the item this one replaced in a re-plan
  unique (trip_id, version, day_index, seq),
  check (end_time > start_time)
);

-- FEEDBACK -------------------------------------------------------------------

create table feedback (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid references trips (id) on delete set null,
  user_id               uuid,
  place_id              uuid references places (id),
  itinerary_item_id     uuid references itinerary_items (id) on delete set null,
  input_mode            text check (input_mode in ('voice', 'text')),
  transcript            text not null check (length(transcript) <= 2000),
  parsed                jsonb not null,
  wheelchair_difficulty text check (wheelchair_difficulty in ('low', 'medium', 'high')),
  terrain_difficulty    text check (terrain_difficulty in ('low', 'medium', 'high')),
  fatigue               text check (fatigue in ('low', 'medium', 'high')),
  crowding              text check (crowding in ('low', 'medium', 'high')),
  noise                 text check (noise in ('low', 'medium', 'high')),
  restroom_ok           boolean,
  entrance_ok           boolean,
  sentiment             smallint check (sentiment between -2 and 2),
  summary               text,                      -- one de-identified sentence
  tip                   text,
  reporter_dna_snapshot jsonb not null,
  reporter_vector       extensions.vector(16) not null,
  consent_aggregate     boolean not null default false,
  is_seed               boolean not null default false,  -- demo rows; the UI labels them
  created_at            timestamptz not null default now()
);
create index feedback_place_consented_idx on feedback (place_id) where consent_aggregate;
create index feedback_trip_idx on feedback (trip_id);
-- Fewer than 10k rows: an exact <=> scan is fast enough, so there is no ANN index.

-- Keep updated_at current.
create function set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger places_updated_at   before update on places   for each row execute function set_updated_at();
create trigger profiles_updated_at before update on profiles for each row execute function set_updated_at();
