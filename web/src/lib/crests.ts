/* La Liga 2026/27 club crest lookup. Crest URLs from football-data.org's CDN —
 * the same source the standings pipeline mirrors, so badges match the Table tab.
 * The 20 clubs + ids come from football-data.org's PD team list (season 2026). */

const CDN = "https://crests.football-data.org";

const TEAMS: { crest: string; aliases: string[] }[] = [
  { crest: `${CDN}/86.png`, aliases: ["real madrid", "real madrid cf"] },
  { crest: `${CDN}/81.png`, aliases: ["barcelona", "fc barcelona", "barça", "barca"] },
  { crest: `${CDN}/78.png`, aliases: ["atletico madrid", "atlético madrid", "atletico de madrid", "atlético de madrid", "club atletico de madrid", "atleti", "atletico"] },
  { crest: `${CDN}/77.png`, aliases: ["athletic bilbao", "athletic club", "athletic"] },
  { crest: `${CDN}/90.png`, aliases: ["real betis", "betis", "real betis balompié"] },
  { crest: `${CDN}/94.png`, aliases: ["villarreal", "villarreal cf"] },
  { crest: `${CDN}/92.png`, aliases: ["real sociedad", "real sociedad de futbol", "real sociedad de fútbol", "la real"] },
  { crest: `${CDN}/559.png`, aliases: ["sevilla", "sevilla fc"] },
  { crest: `${CDN}/95.png`, aliases: ["valencia", "valencia cf"] },
  { crest: `${CDN}/558.png`, aliases: ["celta vigo", "celta", "rc celta de vigo", "celta de vigo"] },
  { crest: `${CDN}/87.png`, aliases: ["rayo vallecano", "rayo", "rayo vallecano de madrid"] },
  { crest: `${CDN}/79.png`, aliases: ["osasuna", "ca osasuna"] },
  { crest: `${CDN}/82.png`, aliases: ["getafe", "getafe cf"] },
  { crest: `${CDN}/263.png`, aliases: ["alaves", "alavés", "deportivo alaves", "deportivo alavés"] },
  { crest: `${CDN}/80.png`, aliases: ["espanyol", "rcd espanyol", "rcd espanyol de barcelona", "espanyol de barcelona"] },
  { crest: `${CDN}/88.png`, aliases: ["levante", "levante ud"] },
  { crest: `${CDN}/285.png`, aliases: ["elche", "elche cf"] },
  { crest: `${CDN}/84.png`, aliases: ["malaga", "málaga", "málaga cf", "malaga cf"] },
  { crest: `${CDN}/560.png`, aliases: ["deportivo la coruna", "deportivo la coruña", "deportivo", "rc deportivo la coruña", "la coruna", "depor"] },
  { crest: `${CDN}/5335.png`, aliases: ["racing santander", "santander", "real racing club de santander", "racing"] },
];

const CREST_BY_NAME: Record<string, string> = {};
for (const t of TEAMS) for (const a of t.aliases) CREST_BY_NAME[a] = t.crest;

function normalize(name?: string): string {
  return (name || "").toString().trim().toLowerCase();
}

export function getCrestUrl(teamName?: string): string | null {
  const n = normalize(teamName);
  if (CREST_BY_NAME[n]) return CREST_BY_NAME[n];
  const stripped = n.replace(/\s+(a?fc|cf)$/, "").trim();
  return CREST_BY_NAME[stripped] || null;
}

export function monogram(teamName?: string): string {
  const words = (teamName || "?").trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2 ? words[0][0] + words[1][0] : (teamName || "?").slice(0, 2);
  return initials.toUpperCase();
}
