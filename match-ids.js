// match-ids.js
// One-time / idempotent backfill — fetches La Liga (competition PD) matches from
// football-data.org, matches each by team names against our Supabase matches
// table, and writes the football-data.org match ID into external_match_id plus
// the authoritative UTC kickoff. generate_fixtures.py already sets these, so this
// is only needed to repair rows deployed before external IDs were captured.
//
// Run: node match-ids.js
// Run again any time — it's idempotent (upserts).

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, FOOTBALL_DATA_API_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !FOOTBALL_DATA_API_KEY) {
  console.error('Missing env. Need SUPABASE_URL, SUPABASE_SERVICE_KEY, FOOTBALL_DATA_API_KEY');
  process.exit(1);
}

const sb = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ---------- 1. Fetch all La Liga fixtures from football-data.org ----------
console.log('Fetching fixtures from football-data.org...');
const fdRes = await fetch(
  'https://api.football-data.org/v4/competitions/PD/matches',
  { headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY } }
);
if (!fdRes.ok) {
  console.error(`football-data.org error: ${fdRes.status} ${await fdRes.text()}`);
  process.exit(1);
}
const fdData = await fdRes.json();
console.log(`Got ${fdData.matches.length} matches from football-data.org\n`);

// ---------- 2. Load our matches from Supabase ----------
const { data: ourMatches, error } = await sb
  .from('matches')
  .select('match_id, home, away, kickoff_ts, external_match_id');
if (error) {
  console.error(`Supabase error: ${error.message}`);
  process.exit(1);
}
console.log(`Got ${ourMatches.length} matches from Supabase\n`);

// ---------- 3. Team name normalization ----------
// Our Supabase rows store the BBC name (LEFT); football-data uses the official
// full name (RIGHT). Map the BBC name onto the football-data name so the
// (home|away) key matches. Only clubs whose names diverge need an entry.
const NAME_MAP = {
  'Atletico Madrid': 'Club Atletico de Madrid',
  'Atlético Madrid': 'Club Atletico de Madrid',
  'Athletic Bilbao': 'Athletic Club',
  'Barcelona':       'FC Barcelona',
  'Real Madrid':     'Real Madrid CF',
  'Real Betis':      'Real Betis Balompie',
  'Real Sociedad':   'Real Sociedad de Futbol',
  'Celta Vigo':      'RC Celta de Vigo',
  'Sevilla':         'Sevilla FC',
  'Valencia':        'Valencia CF',
  'Villarreal':      'Villarreal CF',
  'Getafe':          'Getafe CF',
  'Girona':          'Girona FC',
  'Mallorca':        'RCD Mallorca',
  'Alaves':          'Deportivo Alaves',
  'Espanyol':        'RCD Espanyol de Barcelona',
  'Rayo Vallecano':  'Rayo Vallecano de Madrid',
  'Osasuna':         'CA Osasuna',
  'Levante':         'Levante UD',
  'Elche':           'Elche CF',
};
const normalize = (name) => NAME_MAP[name] || name;

// ---------- 4. Build lookup by (home, away) ----------
function keyFor(home, away) {
  return `${normalize(home)}|${normalize(away)}`;
}

const fdLookup = new Map();
for (const m of fdData.matches) {
  fdLookup.set(keyFor(m.homeTeam.name, m.awayTeam.name), m);
}

// ---------- 5. Update each Supabase row with external_match_id AND correct kickoff_ts ----------
let updated = 0;
const unmatched = [];

for (const m of ourMatches) {
  const k = keyFor(m.home, m.away);
  const fdMatch = fdLookup.get(k);

  if (!fdMatch) {
    unmatched.push({ match_id: m.match_id, key: k });
    continue;
  }

  // football-data is the authoritative schedule source: trust their UTC kickoff time
  const correctKickoff = Math.floor(new Date(fdMatch.utcDate).getTime() / 1000);
  const correctExternalId = String(fdMatch.id);

  const { error: upErr } = await sb
    .from('matches')
    .update({
      external_match_id: correctExternalId,
      kickoff_ts: correctKickoff,
    })
    .eq('match_id', m.match_id);

  if (upErr) {
    console.error(`  ✗ ${m.match_id}: ${upErr.message}`);
    continue;
  }

  const wasTimeWrong = m.kickoff_ts !== correctKickoff;
  const note = wasTimeWrong ? ` (kickoff corrected: ${m.kickoff_ts} -> ${correctKickoff})` : '';
  console.log(`  ✓ ${m.match_id} ${m.home} vs ${m.away} -> ${fdMatch.id}${note}`);
  updated++;
}

// ---------- 6. Summary ----------
console.log(`\n========== DONE ==========`);
console.log(`Updated:    ${updated}`);
console.log(`Unmatched:  ${unmatched.length}`);
if (unmatched.length) {
  console.log(`\nUnmatched rows (check team name spelling vs football-data.org):`);
  unmatched.forEach((u) => console.log(`  ${u.match_id}: key="${u.key}"`));
}
