-- standings.sql
-- Supabase schema for the La Liga '27 Predict "Table" tab.
-- Run this in the Supabase SQL editor (project YOUR_PROJECT_REF) once.
--
-- Populated by cron/api/standings.js (football-data.org -> upsert by team_id).
-- Read by the frontend via the publishable (anon) key, so RLS allows public
-- SELECT; writes come from the backend service key, which bypasses RLS.

create table if not exists public.standings (
  team_id          integer primary key,        -- football-data.org stable team id
  position         integer not null,
  team             text    not null default '',
  short_name       text    not null default '',
  crest            text    not null default '',
  played           integer not null default 0,
  won              integer not null default 0,
  draw             integer not null default 0,
  lost             integer not null default 0,
  goals_for        integer not null default 0,
  goals_against    integer not null default 0,
  goal_difference  integer not null default 0,
  points           integer not null default 0,
  form             text    not null default '', -- e.g. "W,W,D,L,W" (last 5)
  updated_at       timestamptz not null default now()
);

-- Frontend sorts by league position.
create index if not exists standings_position_idx on public.standings (position);

-- Row-level security: public can read the table, nobody can write via the
-- anon/publishable key. The cron uses the service key (bypasses RLS) to upsert.
alter table public.standings enable row level security;

drop policy if exists "standings public read" on public.standings;
create policy "standings public read"
  on public.standings
  for select
  using (true);
