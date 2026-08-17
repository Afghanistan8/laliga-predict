// live-scores.js
// Polls football-data.org for live & near-live La Liga matches, updates
// Supabase, and broadcasts changes via Ably.
//
// Designed to run on a 30-second schedule during match windows.
// Run locally: node live-scores.js
// On Vercel:   exposed as an API route + cron entry in vercel.json (see README)

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import Ably from 'ably';
import 'dotenv/config';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  FOOTBALL_DATA_API_KEY,
  ABLY_API_KEY,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !FOOTBALL_DATA_API_KEY || !ABLY_API_KEY) {
  console.error('Missing env. Need SUPABASE_URL, SUPABASE_SERVICE_KEY, FOOTBALL_DATA_API_KEY, ABLY_API_KEY');
  process.exit(1);
}

const sb = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const ably = new Ably.Rest(ABLY_API_KEY);
const channel = ably.channels.get('live-scores');

// Football-data status → our internal status
function mapStatus(fd) {
  switch (fd) {
    case 'SCHEDULED':
    case 'TIMED':       return 'scheduled';
    case 'IN_PLAY':
    case 'PAUSED':      return 'live';
    case 'FINISHED':    return 'finished';
    case 'POSTPONED':
    case 'CANCELLED':
    case 'SUSPENDED':   return 'postponed';
    default:            return 'scheduled';
  }
}

// Pretty minute string for the UI
function liveMinute(fd) {
  if (fd.status === 'IN_PLAY') {
    if (fd.minute) return String(fd.minute);
    return 'LIVE';
  }
  if (fd.status === 'PAUSED') return 'HT';
  if (fd.status === 'FINISHED') return 'FT';
  return null;
}

// Decide whether a match is interesting enough to update right now
// (skips matches that ended long ago, or that don't kick off for many hours)
function isMatchWorthPolling(now, kickoff_ts, status) {
  const fourHoursBefore = kickoff_ts - 4 * 3600;
  const fiveHoursAfter  = kickoff_ts + 5 * 3600;
  return now >= fourHoursBefore && now <= fiveHoursAfter;
}

const main = async () => {
  const now = Math.floor(Date.now() / 1000);
  console.log(`[live-scores] tick @ ${new Date().toISOString()}`);

  // 1. Get our matches that are near live (or live)
  const { data: matches, error } = await sb
    .from('matches')
    .select('match_id, external_match_id, home, away, kickoff_ts, status, live_score_home, live_score_away, live_minute')
    .not('external_match_id', 'is', null);
  if (error) throw error;

  const candidates = matches.filter((m) =>
    isMatchWorthPolling(now, m.kickoff_ts, m.status)
  );
  if (candidates.length === 0) {
    console.log('  no matches in live window — nothing to do');
    return;
  }
  console.log(`  ${candidates.length} candidate match(es) in window`);

  // 2. Fetch them from football-data in one batch call
  const ids = candidates.map((m) => m.external_match_id).join(',');
  const fdRes = await fetch(
    `https://api.football-data.org/v4/matches?ids=${ids}`,
    { headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY } }
  );
  if (!fdRes.ok) {
    console.error(`  football-data error: ${fdRes.status} ${await fdRes.text()}`);
    return;
  }
  const fdData = await fdRes.json();
  const fdById = new Map(fdData.matches.map((m) => [String(m.id), m]));

  // 3. For each candidate, see what changed and push the update
  let changed = 0;
  for (const ours of candidates) {
    // external_match_id comes back as a number; fdById is keyed by String(id).
    const fd = fdById.get(String(ours.external_match_id));
    if (!fd) {
      console.log(`  ⚠️  ${ours.match_id} — football-data didn't return this ID`);
      continue;
    }

    const newScoreHome = fd.score?.fullTime?.home ?? null;
    const newScoreAway = fd.score?.fullTime?.away ?? null;
    const newMinute    = liveMinute(fd);
    const newStatus    = mapStatus(fd.status);

    const noChange =
      ours.live_score_home === (newScoreHome ?? 0) &&
      ours.live_score_away === (newScoreAway ?? 0) &&
      ours.live_minute === newMinute &&
      ours.status === newStatus;
    if (noChange) continue;

    const update = {
      live_score_home: newScoreHome ?? 0,
      live_score_away: newScoreAway ?? 0,
      live_minute:     newMinute,
      status:          newStatus,
      updated_at:      new Date().toISOString(),
    };

    const { error: upErr } = await sb
      .from('matches')
      .update(update)
      .eq('match_id', ours.match_id);
    if (upErr) {
      console.error(`  ✗ ${ours.match_id} supabase update: ${upErr.message}`);
      continue;
    }

    // Broadcast just-the-delta payload via Ably
    await channel.publish('score-update', {
      match_id: ours.match_id,
      home: ours.home,
      away: ours.away,
      live_score_home: update.live_score_home,
      live_score_away: update.live_score_away,
      live_minute: update.live_minute,
      status: update.status,
    });

    console.log(
      `  ✓ ${ours.match_id} ${ours.home} ${update.live_score_home}-${update.live_score_away} ${ours.away}` +
        ` [${update.live_minute || ''} ${update.status}]`
    );
    changed++;
  }

  console.log(`  ${changed} match(es) updated`);
};

await main().catch((err) => {
  console.error('[live-scores] fatal:', err);
  process.exit(1);
});
