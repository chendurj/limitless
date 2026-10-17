-- Access rules.
--
-- The browser never talks to the database. The FastAPI server uses the service_role
-- key and filters every query by the user from the demo bearer token. So:
-- - RLS is on for every table, with no policies for anon or authenticated (deny all).
-- - Only service_role gets table rights. The project does not expose new tables
--   automatically, so this grant is necessary.

alter table places              enable row level security;
alter table place_accessibility enable row level security;
alter table place_photos        enable row level security;
alter table travel_cache        enable row level security;
alter table profiles            enable row level security;
alter table trips               enable row level security;
alter table itinerary_items     enable row level security;
alter table feedback            enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables    in schema public to service_role;
grant usage, select                  on all sequences in schema public to service_role;
grant execute                        on all functions in schema public to service_role;
