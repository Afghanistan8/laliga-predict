-- migration-lock-writes.sql
-- Run this ONCE in the Supabase SQL editor (project YOUR_PROJECT_REF) to
-- close the public-write hole on an already-created database.
--
-- It removes every public INSERT/UPDATE policy on predictions + users, leaving
-- only public SELECT. After this, the publishable/anon key can read but not
-- write; all writes go through the service-role mirror endpoints.
--
-- Safe to run repeatedly.

drop policy if exists "predictions public insert" on public.predictions;
drop policy if exists "predictions public update" on public.predictions;
drop policy if exists "users public insert"       on public.users;

-- Make sure RLS is on and public read still exists (idempotent).
alter table public.predictions enable row level security;
alter table public.users       enable row level security;

drop policy if exists "predictions public read" on public.predictions;
create policy "predictions public read" on public.predictions for select using (true);

drop policy if exists "users public read" on public.users;
create policy "users public read" on public.users for select using (true);

-- Verify: this should list ONLY "... public read" policies for these tables.
-- select tablename, policyname, cmd from pg_policies
-- where schemaname='public' and tablename in ('predictions','users');
