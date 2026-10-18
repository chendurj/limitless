-- The team's source-linked research (data/locations-research.json).
-- research_summary is the researcher's text and research_sources its links. They are shown on
-- the place card as written; they never satisfy a must-have.

alter table places add column research_summary text;
alter table places add column research_sources jsonb not null default '[]';

alter table place_accessibility drop constraint place_accessibility_attribute_check;
alter table place_accessibility add constraint place_accessibility_attribute_check check (attribute in (
  -- open status: open | closed | partial (detail names the closed areas and until when)
  'status',
  -- mobility
  'entrance_step_free', 'restroom_accessible', 'parking_accessible', 'dropoff_zone', 'elevator',
  'stairs', 'terrain', 'max_slope', 'typical_walk_m', 'standing_min', 'seating', 'shade',
  'wheelchair_rental', 'ecv_rental', 'beach_wheelchair', 'beach_mat', 'accessible_transit',
  'ada_accessible',          -- no = the operator says the place is not ADA-accessible
  -- blind and low vision
  'audio_description', 'braille_tactile', 'large_print', 'sighted_guide_on_request',
  'edge_hazard', 'guide_dog_relief', 'service_animal_ok',
  -- deaf and hard of hearing
  'captions_asl', 'assistive_listening',
  -- communication without voice calls
  'online_booking',          -- yes = book or buy tickets online or in an app
  'booking_phone_only',      -- yes = a phone call is the only way to book
  'text_contact',            -- yes = the venue answers SMS, chat or email
  'kiosk_or_app_ordering',   -- yes = order at a kiosk, by QR code or in an app
  'written_notes_ok',        -- yes = staff confirm that they accept written notes
  -- sensory and cognitive
  'crowd_level', 'noise_level', 'quiet_space', 'sensory_kit'));
