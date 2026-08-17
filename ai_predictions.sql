-- ai_predictions.sql
-- Supabase schema for the La Liga '27 Predict "AI Call" tab.
-- Run this in the Supabase SQL editor (project YOUR_PROJECT_REF) once.
--
-- Written by cron/api/predict-matches.js: Phase B inserts a 'pending' row when
-- it submits predict(); Phase A flips it to 'stored' with the pick once the tx
-- FINALIZES on-chain. Read by the frontend (publishable key) so the AI Call
-- badge is a sub-second Supabase read instead of an on-chain call per fixture.

create table if not exists public.ai_predictions (
  match_id      text primary key,          -- same id the market + AIPredictor use
  home          text not null default '',
  away          text not null default '',
  date          text not null default '',  -- YYYY-MM-DD
  pick          text,                      -- 'home' | 'draw' | 'away' (null until stored)
  confidence    text,                      -- 'low' | 'medium' | 'high'
  reason        text,                      -- one-line rationale
  status        text not null default 'pending', -- 'pending' | 'stored' | 'failed'
  tx_hash       text,
  error         text,
  submitted_at  timestamptz,
  stored_at     timestamptz
);

create index if not exists ai_predictions_status_idx on public.ai_predictions (status);

-- RLS: public may read (frontend shows the AI's call); only the backend
-- service key (which bypasses RLS) writes.
alter table public.ai_predictions enable row level security;

drop policy if exists "ai_predictions public read" on public.ai_predictions;
create policy "ai_predictions public read"
  on public.ai_predictions
  for select
  using (true);
