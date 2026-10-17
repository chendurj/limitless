-- One snapshot of the full itinerary (TripOut) for each trip version.
-- The planner output is stored as is, so GET returns exactly what the planner made.
-- A re-plan adds a new version; older versions stay for the diff and for undo.

create table trip_versions (
  trip_id    uuid not null references trips (id) on delete cascade,
  version    int not null,
  plan       jsonb not null,
  reason     text,                -- why this version was made, e.g. the feedback summary
  created_at timestamptz not null default now(),
  primary key (trip_id, version)
);

alter table trip_versions enable row level security;
revoke all on trip_versions from anon, authenticated;
grant select, insert, update, delete on trip_versions to service_role;
