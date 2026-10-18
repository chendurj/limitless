-- Re-plan: a proposed version waits for the traveler to confirm it.
-- overrides holds the trip-only changes from feedback: the adjusted DNA and per-place facts.

alter table trip_versions
  add column status text not null default 'applied' check (status in ('proposed', 'applied')),
  add column overrides jsonb not null default '{}';
