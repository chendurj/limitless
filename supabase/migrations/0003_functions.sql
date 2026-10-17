-- Similar-traveler feedback, called by the server through supabase-py .rpc().
-- Returns de-identified fields only: no user_id and no transcript.

create function match_feedback(q extensions.vector(16), place_ids uuid[], min_sim float, k int)
returns table (
  place_id uuid, similarity float, wheelchair_difficulty text, terrain_difficulty text,
  fatigue text, sentiment smallint, summary text, tip text, created_at timestamptz, is_seed boolean
)
language sql stable
set search_path = public, extensions
as $$
  select f.place_id, 1 - (f.reporter_vector <=> q) as similarity, f.wheelchair_difficulty,
         f.terrain_difficulty, f.fatigue, f.sentiment, f.summary, f.tip, f.created_at, f.is_seed
  from feedback f
  where f.consent_aggregate
    and f.place_id = any (place_ids)
    and 1 - (f.reporter_vector <=> q) >= min_sim
  order by f.reporter_vector <=> q
  limit k;
$$;

revoke all on function match_feedback from public, anon, authenticated;
grant execute on function match_feedback to service_role;
