/* lib/crests.js — Maps La Liga 2026/27 team names to club crest images.
 *
 * The crest counterpart of a national-flag lookup. Crest URLs come from
 * football-data.org's stable CDN (crests.football-data.org), the same source
 * the standings pipeline mirrors, so badges here match the Table tab exactly.
 *
 * The 20 clubs + ids are pulled live from football-data.org's PD (Primera
 * División) team list for season 2026. Keyed generously (BBC name, official
 * name, Spanish spellings, nicknames) because fixtures may store either the
 * BBC "Atletico Madrid" or the official "Club Atletico de Madrid".
 */

const CDN = 'https://crests.football-data.org';

// One entry per 2026/27 La Liga (Primera División) club.
const TEAMS = [
  { crest: `${CDN}/86.png`,   aliases: ['real madrid', 'real madrid cf'] },
  { crest: `${CDN}/81.png`,   aliases: ['barcelona', 'fc barcelona', 'barça', 'barca'] },
  { crest: `${CDN}/78.png`,   aliases: ['atletico madrid', 'atlético madrid', 'atletico de madrid', 'atlético de madrid', 'club atletico de madrid', 'atleti', 'atletico'] },
  { crest: `${CDN}/77.png`,   aliases: ['athletic bilbao', 'athletic club', 'athletic'] },
  { crest: `${CDN}/90.png`,   aliases: ['real betis', 'betis', 'real betis balompié'] },
  { crest: `${CDN}/94.png`,   aliases: ['villarreal', 'villarreal cf'] },
  { crest: `${CDN}/92.png`,   aliases: ['real sociedad', 'real sociedad de futbol', 'real sociedad de fútbol', 'la real'] },
  { crest: `${CDN}/559.png`,  aliases: ['sevilla', 'sevilla fc'] },
  { crest: `${CDN}/95.png`,   aliases: ['valencia', 'valencia cf'] },
  { crest: `${CDN}/558.png`,  aliases: ['celta vigo', 'celta', 'rc celta de vigo', 'celta de vigo'] },
  { crest: `${CDN}/87.png`,   aliases: ['rayo vallecano', 'rayo', 'rayo vallecano de madrid'] },
  { crest: `${CDN}/79.png`,   aliases: ['osasuna', 'ca osasuna'] },
  { crest: `${CDN}/82.png`,   aliases: ['getafe', 'getafe cf'] },
  { crest: `${CDN}/263.png`,  aliases: ['alaves', 'alavés', 'deportivo alaves', 'deportivo alavés'] },
  { crest: `${CDN}/80.png`,   aliases: ['espanyol', 'rcd espanyol', 'rcd espanyol de barcelona', 'espanyol de barcelona'] },
  { crest: `${CDN}/88.png`,   aliases: ['levante', 'levante ud'] },
  { crest: `${CDN}/285.png`,  aliases: ['elche', 'elche cf'] },
  { crest: `${CDN}/84.png`,   aliases: ['malaga', 'málaga', 'málaga cf', 'malaga cf'] },
  { crest: `${CDN}/560.png`,  aliases: ['deportivo la coruna', 'deportivo la coruña', 'deportivo', 'rc deportivo la coruña', 'la coruna', 'depor'] },
  { crest: `${CDN}/5335.png`, aliases: ['racing santander', 'santander', 'real racing club de santander', 'racing'] },
];

const CREST_BY_NAME = {};
for (const t of TEAMS) {
  for (const a of t.aliases) CREST_BY_NAME[a] = t.crest;
}

function normalize(name) {
  return (name || '').toString().trim().toLowerCase();
}

export function getCrestUrl(teamName) {
  const n = normalize(teamName);
  if (CREST_BY_NAME[n]) return CREST_BY_NAME[n];
  // Fall back: strip a trailing " fc"/" cf" and retry.
  const stripped = n.replace(/\s+(a?fc|cf)$/, '').trim();
  return CREST_BY_NAME[stripped] || null;
}

/* A two-letter monogram used when no crest is found (keeps layout stable). */
function monogram(teamName) {
  const words = (teamName || '?').trim().split(/\s+/).filter(Boolean);
  const initials = (words.length >= 2
    ? words[0][0] + words[1][0]
    : (teamName || '?').slice(0, 2)).toUpperCase();
  return `<span class="team-crest crest-fallback" aria-hidden="true">${initials}</span>`;
}

/* Returns an <img> for the club crest, or a monogram span if unmapped.
 * size: pixel box (crests render square). */
export function crestImg(teamName, size = 40, className = 'team-crest') {
  const url = getCrestUrl(teamName);
  if (!url) return monogram(teamName);
  return `<img src="${url}" alt="${teamName}" class="${className}" width="${size}" height="${size}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">`;
}
