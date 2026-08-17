"""
Generate fixtures.json for the 2026/27 La Liga (Primera Division) season
(matchdays 1-5).

Pulls live data from football-data.org so the team names, kickoff times, and
fixture IDs are always accurate. Uses the FOOTBALL_DATA_API_KEY env var.

La Liga's football-data.org competition code is "PD" (Primera Division).

Run:
    python generate_fixtures.py          # writes fixtures.json
    python generate_fixtures.py --dry    # prints without writing
"""

import json
import sys
import os
import urllib.request

API_KEY = os.environ.get("FOOTBALL_DATA_API_KEY", "")
if not API_KEY:
    sys.exit("FOOTBALL_DATA_API_KEY not set")

MATCHDAYS = range(1, 6)   # 1-5 inclusive -> 50 matches (20 clubs, 10 per md)

# Pin the season we're deploying markets for. The football-data.org API's
# `currentSeason` for competition PD points to 2026/27 through mid-2027, so
# for now this matches the endpoint's implicit default. Pinning it explicitly
# is defensive: once the season ends the API will roll forward to 2027/28, and
# without ?season=2026 any late re-run would fetch the WRONG season and mint
# wildly-mis-dated markets.
SEASON = 2026

# Plausible calendar window for the 2026/27 La Liga season. Any kickoff outside
# this range is a strong signal something is wrong (API returned a different
# season, timezone bug, etc.) and the script refuses to write fixtures.json.
import datetime as _dt
_SEASON_MIN_TS = int(_dt.datetime(2026, 8, 1,  tzinfo=_dt.timezone.utc).timestamp())
_SEASON_MAX_TS = int(_dt.datetime(2027, 6, 30, tzinfo=_dt.timezone.utc).timestamp())

# football-data.org shortName -> name BBC Sport uses to identify La Liga teams.
# BBC generally uses the short popular / anglicised name; only the clubs whose
# BBC label differs from football-data's shortName are mapped here. Extra
# variants (Spanish spellings, accented forms, common English shorthands seen
# on BBC / ESPN score pages) are included so a source-side rename never
# silently degrades team-name normalisation.
BBC_NAME = {
    # Atletico Madrid
    "Atleti":                "Atletico Madrid",
    "Atlético":              "Atletico Madrid",
    "Atlético Madrid":       "Atletico Madrid",
    "Atletico":              "Atletico Madrid",
    # Athletic Club (Bilbao)
    "Athletic":              "Athletic Bilbao",
    "Athletic Club":         "Athletic Bilbao",
    # Barcelona
    "Barça":                 "Barcelona",
    "Barca":                 "Barcelona",
    "FC Barcelona":          "Barcelona",
    # Real Betis
    "Betis":                 "Real Betis",
    # Celta Vigo
    "Celta":                 "Celta Vigo",
    "RC Celta":              "Celta Vigo",
    # Sevilla
    "Sevilla FC":            "Sevilla",
    # Rayo Vallecano
    "Rayo":                  "Rayo Vallecano",
    # Alaves
    "Alavés":                "Alaves",
    "Alaves":                "Alaves",
    "Deportivo Alavés":      "Alaves",
    # Malaga
    "Málaga":                "Malaga",
    "Malaga":                "Malaga",
    "Málaga CF":             "Malaga",
    # Deportivo La Coruna
    "Deportivo":             "Deportivo La Coruna",
    "Deportivo de La Coruña":"Deportivo La Coruna",
    "Deportivo La Coruña":   "Deportivo La Coruna",
    # Racing Santander
    "Santander":             "Racing Santander",
    "Racing":                "Racing Santander",
    "Racing de Santander":   "Racing Santander",
    # Levante / Elche / Espanyol / Getafe / Osasuna: BBC uses the plain short
    # names, no remap needed but listed here as intentional-identity.
    "Levante":               "Levante",
    "Elche":                 "Elche",
    "Espanyol":              "Espanyol",
    "Getafe":                "Getafe",
    "Osasuna":               "Osasuna",
    "Valencia":              "Valencia",
    "Villarreal":            "Villarreal",
    "Real Madrid":           "Real Madrid",
    "Real Sociedad":         "Real Sociedad",
}

def bbc_name(short: str) -> str:
    return BBC_NAME.get(short, short)


def fetch_matchday(md: int) -> list:
    url = (
        "https://api.football-data.org/v4/competitions/PD/matches"
        f"?matchday={md}&season={SEASON}"
    )
    req = urllib.request.Request(url, headers={"X-Auth-Token": API_KEY})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())["matches"]


def main():
    dry = "--dry" in sys.argv
    fixtures = []
    seq_per_md: dict[int, int] = {}

    for md in MATCHDAYS:
        print(f"Fetching matchday {md}…", end=" ", flush=True)
        matches = fetch_matchday(md)
        print(f"{len(matches)} matches")
        for m in matches:
            seq_per_md[md] = seq_per_md.get(md, 0) + 1
            match_id = f"laliga2027_md{md}_{seq_per_md[md]:02d}"
            kickoff_ts = int(
                __import__("datetime").datetime.fromisoformat(
                    m["utcDate"].replace("Z", "+00:00")
                ).timestamp()
            )
            home_short = m["homeTeam"]["shortName"]
            away_short = m["awayTeam"]["shortName"]
            fixtures.append({
                "match_id":          match_id,
                "external_match_id": m["id"],
                "home":              bbc_name(home_short),
                "away":              bbc_name(away_short),
                "home_full":         m["homeTeam"]["name"],
                "away_full":         m["awayTeam"]["name"],
                "kickoff_ts":        kickoff_ts,
                "matchday":          md,
            })

    # ---------------- Sanity checks (fail hard rather than write bad data) ----
    expected = 10 * len(list(MATCHDAYS))
    assert len(fixtures) == expected, f"expected {expected}, got {len(fixtures)}"
    ids = {f["match_id"] for f in fixtures}
    assert len(ids) == expected, "duplicate match_id"
    ext_ids = {f["external_match_id"] for f in fixtures}
    assert len(ext_ids) == expected, "duplicate external_match_id"

    # Season-window check: every kickoff MUST fall inside the 2026/27 window.
    # If the API silently rolls the season forward, this catches it before
    # any wildly-mis-dated market is deployed.
    bad = [
        (f["match_id"], f["kickoff_ts"])
        for f in fixtures
        if not (_SEASON_MIN_TS <= f["kickoff_ts"] <= _SEASON_MAX_TS)
    ]
    if bad:
        sys.exit(
            f"REFUSING TO WRITE: {len(bad)} kickoff(s) outside 2026/27 window "
            f"({_dt.datetime.utcfromtimestamp(_SEASON_MIN_TS).date()} .. "
            f"{_dt.datetime.utcfromtimestamp(_SEASON_MAX_TS).date()}). "
            f"First offender: {bad[0]}"
        )

    # Every home/away name must have made it through normalisation as a
    # non-empty string (defensive: catches an API schema change).
    for f in fixtures:
        if not f["home"] or not f["away"]:
            sys.exit(f"empty team name on {f['match_id']}: {f}")

    fixtures.sort(key=lambda f: f["kickoff_ts"])

    if dry:
        print(json.dumps(fixtures, indent=2))
    else:
        with open("fixtures.json", "w", encoding="utf-8") as fh:
            json.dump(fixtures, fh, indent=2)
        print(f"\nOK fixtures.json written - {len(fixtures)} matches")
        import datetime
        first_ts = fixtures[0]["kickoff_ts"]
        last_ts  = fixtures[-1]["kickoff_ts"]
        print(f"  First kickoff: {datetime.datetime.fromtimestamp(first_ts, tz=datetime.timezone.utc).isoformat()}")
        print(f"  Last kickoff:  {datetime.datetime.fromtimestamp(last_ts,  tz=datetime.timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
