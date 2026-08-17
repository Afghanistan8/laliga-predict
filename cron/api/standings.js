// api/standings.js
// Vercel API route — called by cron-job.org on a schedule.
// Scrapes the La Liga table from BBC Sport and mirrors it to Supabase,
// so the frontend "Table" tab reads sub-second from Postgres.
//
// BBC is the authoritative source — the same one the market contracts use for
// resolution — and it carries the correct 2026/27 La Liga clubs. football-
// data.org's free tier serves stale prior-season standings until the new
// season actually kicks off.
//
// Pure-regex HTML parse: no jsdom / no new dependency. Crests are mapped to the
// football-data CDN so they match the crests used on the match cards.

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const BBC_TABLE_URL = 'https://www.bbc.com/sport/football/spanish-la-liga/table';

// team name (as BBC prints it) -> { id, crest, short } using football-data's
// stable CDN, so the Table tab crests match the rest of the app.
const CDN = 'https://crests.football-data.org';
const TEAM_META = {
  'Real Madrid':          { id: 86,   crest: `${CDN}/86.png`,   short: 'Real Madrid' },
  'Barcelona':            { id: 81,   crest: `${CDN}/81.png`,   short: 'Barcelona' },
  'Atletico Madrid':      { id: 78,   crest: `${CDN}/78.png`,   short: 'Atletico Madrid' },
  'Atlético Madrid':      { id: 78,   crest: `${CDN}/78.png`,   short: 'Atletico Madrid' },
  'Athletic Bilbao':      { id: 77,   crest: `${CDN}/77.png`,   short: 'Athletic Club' },
  'Athletic Club':        { id: 77,   crest: `${CDN}/77.png`,   short: 'Athletic Club' },
  'Real Betis':           { id: 90,   crest: `${CDN}/90.png`,   short: 'Real Betis' },
  'Villarreal':           { id: 94,   crest: `${CDN}/94.png`,   short: 'Villarreal' },
  'Real Sociedad':        { id: 92,   crest: `${CDN}/92.png`,   short: 'Real Sociedad' },
  'Sevilla':              { id: 559,  crest: `${CDN}/559.png`,  short: 'Sevilla' },
  'Valencia':             { id: 95,   crest: `${CDN}/95.png`,   short: 'Valencia' },
  'Celta Vigo':           { id: 558,  crest: `${CDN}/558.png`,  short: 'Celta Vigo' },
  'Celta':                { id: 558,  crest: `${CDN}/558.png`,  short: 'Celta Vigo' },
  'Rayo Vallecano':       { id: 87,   crest: `${CDN}/87.png`,   short: 'Rayo Vallecano' },
  'Osasuna':              { id: 79,   crest: `${CDN}/79.png`,   short: 'Osasuna' },
  'Getafe':               { id: 82,   crest: `${CDN}/82.png`,   short: 'Getafe' },
  'Alaves':               { id: 263,  crest: `${CDN}/263.png`,  short: 'Alaves' },
  'Alavés':               { id: 263,  crest: `${CDN}/263.png`,  short: 'Alaves' },
  'Espanyol':             { id: 80,   crest: `${CDN}/80.png`,   short: 'Espanyol' },
  'Levante':              { id: 88,   crest: `${CDN}/88.png`,   short: 'Levante' },
  'Elche':                { id: 285,  crest: `${CDN}/285.png`,  short: 'Elche' },
  'Malaga':               { id: 84,   crest: `${CDN}/84.png`,   short: 'Malaga' },
  'Málaga':               { id: 84,   crest: `${CDN}/84.png`,   short: 'Malaga' },
  'Deportivo La Coruna':  { id: 560,  crest: `${CDN}/560.png`,  short: 'Deportivo' },
  'Deportivo La Coruña':  { id: 560,  crest: `${CDN}/560.png`,  short: 'Deportivo' },
  'Deportivo':            { id: 560,  crest: `${CDN}/560.png`,  short: 'Deportivo' },
  'Racing Santander':     { id: 5335, crest: `${CDN}/5335.png`, short: 'Racing Santander' },
  'Racing':               { id: 5335, crest: `${CDN}/5335.png`, short: 'Racing Santander' },
  'Santander':            { id: 5335, crest: `${CDN}/5335.png`, short: 'Racing Santander' },
};

function metaFor(team) {
  if (TEAM_META[team]) return TEAM_META[team];
  // loose match (e.g. "Atletico" vs "Atletico Madrid")
  const key = Object.keys(TEAM_META).find(
    (k) => team.includes(k) || k.includes(team)
  );
  return key ? TEAM_META[key] : null;
}

// Decode the handful of HTML entities BBC emits in team names (accents, ampersands).
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'missing env vars' });
  }

  const sb = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // 1. Fetch the BBC table HTML
    const bbcRes = await fetch(BBC_TABLE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!bbcRes.ok) {
      return res.status(502).json({ error: 'bbc fetch fail', status: bbcRes.status });
    }
    const html = await bbcRes.text();

    // 2. Isolate the <table> and split into rows
    const tableMatch = html.match(/<table[\s\S]*?<\/table>/);
    if (!tableMatch) {
      return res.status(200).json({ ok: true, message: 'no table found', rows: 0 });
    }
    const trs = [...tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);

    const now = new Date().toISOString();
    const parsed = [];

    // 3. Parse each data row (skip header)
    for (const tr of trs) {
      const cells = [...tr.matchAll(/<t[dh][\s\S]*?<\/t[dh]>/g)].map((c) =>
        c[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      );
      if (cells.length < 10) continue;
      if (/^team$/i.test(cells[0])) continue; // header row

      // First cell is "1Real Madrid" (position glued to team name)
      const posAndTeam = cells[0];
      const posMatch = posAndTeam.match(/^(\d+)/);
      if (!posMatch) continue;
      const position = Number(posMatch[1]);
      const team = decodeEntities(posAndTeam.slice(posMatch[1].length).trim());

      const meta = metaFor(team);

      parsed.push({
        team_id: meta ? meta.id : (position + 100000), // stable fallback id
        position,
        team,
        short_name: meta ? meta.short : team,
        crest: meta ? meta.crest : '',
        played:          Number(cells[1]) || 0,
        won:             Number(cells[2]) || 0,
        draw:            Number(cells[3]) || 0,
        lost:            Number(cells[4]) || 0,
        goals_for:       Number(cells[5]) || 0,
        goals_against:   Number(cells[6]) || 0,
        goal_difference: Number(cells[7]) || 0,
        points:          Number(cells[8]) || 0,
        form:            cells[9] === 'No ResultNo ResultNo ResultNo ResultNo ResultNo Result' ? '' : cells[9],
        updated_at:      now,
      });
    }

    if (parsed.length === 0) {
      return res.status(200).json({ ok: true, message: 'parsed 0 rows', rows: 0 });
    }

    // 4. Replace the table: clear stale rows, then insert the fresh 20.
    // (team_id set changes between seasons, so upsert alone would leave last
    // season's relegated clubs behind — delete-then-insert keeps it exact.)
    await sb.from('standings').delete().neq('team_id', -1);
    const { error: insErr } = await sb.from('standings').insert(parsed);
    if (insErr) throw new Error(`supabase standings.insert: ${insErr.message}`);

    return res.status(200).json({ ok: true, rows: parsed.length, updated_at: now });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
