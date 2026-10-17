-- Allow facts from the team's demo dataset. These facts show the label "demo data" in the app.

alter table place_accessibility drop constraint place_accessibility_source_check;
alter table place_accessibility add constraint place_accessibility_source_check check (source in (
  'official', 'phone_call', 'team_verified', 'wheelmap', 'osm', 'google_places',
  'community_feedback', 'photo_ai', 'inferred', 'demo_data'));

-- Demo data is never VERIFIED.
alter table place_accessibility add constraint demo_data_not_verified
  check (source <> 'demo_data' or confidence <> 'VERIFIED');
