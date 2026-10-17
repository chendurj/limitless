-- Place attributes for travelers who do not use voice calls (Deaf or non-speaking).

alter table place_accessibility drop constraint place_accessibility_attribute_check;
alter table place_accessibility add constraint place_accessibility_attribute_check check (attribute in (
  -- open status: open | closed | partial (detail names the closed areas and until when)
  'status',
  -- mobility
  'entrance_step_free', 'restroom_accessible', 'parking_accessible', 'dropoff_zone', 'elevator',
  'stairs', 'terrain', 'max_slope', 'typical_walk_m', 'standing_min', 'seating', 'shade',
  'wheelchair_rental', 'ecv_rental', 'beach_wheelchair', 'beach_mat', 'accessible_transit',
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
