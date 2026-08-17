# La Liga '27 Predict

**A fully on-chain, pari-mutuel prediction market for the 2026/27 La Liga (Primera División / "LaLiga EA Sports") — settled by AI consensus on [GenLayer](https://genlayer.com) Bradbury testnet, with no oracle, no backend resolver, and no admin keys touching the money.**

🔗 **Live demos:**
- Canonical (vanilla): [laliga27-predict.vercel.app](https://laliga27-predict.vercel.app)
- Next.js + RainbowKit: [laliga27-predict-web.vercel.app](https://laliga27-predict-web.vercel.app)

---

## Porting notes (read me first)

**This repository is a faithful port of [epl27-predict](https://github.com/Afghanistan8/epl27-predict) (EPL '27 Predict) to the 2026/27 La Liga season.** The architecture, trust model, and — critically — the contract hardening are **identical to EPL v0.3.1**. Nothing about how money is handled, how markets close, or how postponements are verified was redesigned; only the competition-specific data and branding changed.

What changed for La Liga:

- **Competition identity.** "EPL" / "Premier League" → "La Liga" throughout; `epl2027_*` match IDs → `laliga2027_*`; football-data.org competition code `PL` → **`PD`** (Primera División); BBC Sport slug `premier-league` → `spanish-la-liga`.
- **Clubs & fixtures.** `generate_fixtures.py` now pulls `competitions/PD/matches`, with a Spanish-club BBC-name map (Atlético Madrid → "Atletico Madrid", Athletic Club → "Athletic Bilbao", Celta Vigo, Real Betis, Real Sociedad, …). `fixtures.json` holds MD1–5 (50 fixtures) for the 20 La Liga clubs.
- **Crests / standings.** Crest lookups and the standings scraper are re-keyed to the 20 La Liga clubs on football-data.org's stable CDN.
- **Resolution & AI prompts.** The `resolve()` and `mark_postponed()` team-name normalization examples, and the AI Call source URL (`bbc.com/sport/football/spanish-la-liga/table`), are La Liga-specific.
- **Tests.** The deadline + postponement suite runs against a La Liga fixture (Real Madrid vs Elche, MD1).

What did **not** change (identical to EPL v0.3.1): the immutable `kickoff_ts` betting deadline, `submit_prediction()` reverting at/after kickoff, `POSTPONE_GRACE_SECS = 10800`, the permissionless + source-verified `mark_postponed()` with per-source conflict rejection and the safe missing-secondary policy, the pari-mutuel pools, `MIN_STAKE = 2 GEN`, and the integer-division dust sweep.

> **Deployment placeholders.** The EPL contract addresses, Supabase project ref/keys, and the deployed AI-Call address are **not** carried over — they were EPL-specific. Fill in your own Supabase project in `frontend/lib/config.js`, `web/src/lib/config.ts`, and `.env`, then deploy fresh contracts (see "Running it locally"). `fixtures.json` is a generated snapshot; re-run `generate_fixtures.py` with a football-data.org key to refresh it against the authoritative schedule.

---

## The two review comments this port preserves

The EPL contract's hardening came from two GenLayer Steward review comments (they took the contract from v0.3.0 → v0.3.1). This port keeps every point they raise, implemented exactly as EPL already solved it.

**Review 1 — the original request:**

> "Please enforce a fixture-specific betting deadline or irreversible close in the contract so nobody can stake after kickoff or once the result is known. Also make postponement refunds follow a verifiable, constrained policy and add tests for late entry and cancellation after play begins."

**Review 2 — follow-up after the deadline + permissionless postponement were added:**

> "Thanks for adding the on-chain kickoff deadline and permissionless postponement check. Please make postponement reject conflicting source statuses, define a safe policy for a missing secondary source and suspended or abandoned matches, and add tests for cancellation after play begins plus conflicting and unavailable sources."

How `prediction_market.py` answers them (see the inline comments in the file):

- **Immutable `kickoff_ts`** in the constructor.
- **`submit_prediction()` reverts** with `"betting closed: match has kicked off"` once `_now_epoch() >= kickoff_ts`, using the consensus tx time `gl.message_raw["datetime"]` — so no stake lands after kickoff (and therefore never once the result is known).
- **`POSTPONE_GRACE_SECS = 10800`** (3h after kickoff) before a postponement can even be attempted.
- **`mark_postponed()` is permissionless + source-verified:** it classifies each source independently under `strict_eq`, **rejects a `finished` result on either source** (which also rejects conflicts), requires the primary to confirm, and falls back to **primary-only only when the primary is explicit** if the secondary is unavailable; suspended/abandoned-with-no-score is treated as postponed. Any ambiguity leaves the market `open`.
- **Tests** in `tests/` cover late entry after kickoff, cancellation/refund after play begins, conflicting source statuses, an unavailable secondary source, and suspended/abandoned matches.

---

## What it does

- Anyone with test GEN can stake on the outcome of any deployed La Liga fixture — **home win, draw, or away win** — with a 2 GEN minimum.
- Every match is its own **Intelligent Contract** holding three pools (home/draw/away). Stakes go into the pool for your pick.
- After kickoff, the contract **reads the full-time score straight off BBC Sport** and resolves itself through validator consensus. Winners split the entire pot pro-rata. No rake, no house edge.
- Separately, GenLayer's validators publish their **own pre-match prediction** ("the AI Call") for each fixture, stored on-chain, shown next to the crowd's pools so you can see where the machine and the market disagree.
- A live **La Liga table** and a **leaderboard** of the sharpest predictors round it out.

Everything the money touches lives on-chain. Supabase is only a fast read-mirror so the UI loads instantly — it is never the source of truth.

---

## How it works under the hood

### 1. The contract reads the web itself

In `prediction_market.py`, resolution renders the live scoreboard *inside* the contract execution — from **two independent sources**, BBC Sport (primary) and ESPN (secondary):

```python
primary   = gl.nondet.web.render(self.resolution_url,   mode="text")  # BBC
secondary = gl.nondet.web.render(self.resolution_url_2, mode="text")  # ESPN
```

There is no oracle service, no off-chain job pushing scores in, no trusted signer. The web pages **are** the source of truth, fetched by the validators at the moment of resolution. The prompt bases the result on the primary, uses the secondary as a cross-check, and returns "not resolved" (leaving the match open) if the two clearly disagree — so a single bad read can't settle a market. Team names are normalized in the prompt ("Atletico"/"Atlético de Madrid" = "Atletico Madrid", "Athletic Bilbao" = "Athletic Club", …) so minor spelling differences between sources still match the same fixture.

### 2. AI consensus turns a messy web page into a settled result

The score is extracted by an LLM, and the result only finalizes if the validators independently agree on the same structured answer:

```python
result_json = gl.eq_principle.strict_eq(get_match_result)
```

A final score is an objective fact, so I use **strict equivalence** here — every validator must arrive at the identical `{score, winner}` JSON or nothing is written. If the match hasn't finished, `winner` comes back `-1` and the contract simply stays open to retry later.

### 3. The AI Call — validators forecasting, not just reporting

`ai_predictor.py` is a separate, single contract for the whole season. Before a match, it asks the network for a *prediction*, using the **non-comparative** equivalence principle:

```python
raw = gl.eq_principle.prompt_non_comparative(
    gather_evidence,           # returns the input the LLM reasons over
    task="...",                # "predict this fixture's outcome"
    criteria="...",            # "is this a defensible home/draw/away call?"
)
```

The leader validator produces a pick + confidence + one-line reason; the other validators judge whether that answer is defensible against fixed criteria, rather than each re-running the whole forecast. This is deliberately lighter on Bradbury's small validator set than forcing every validator to independently re-predict, and "is this call reasonable?" is the right question to reach consensus on for a subjective judgement. The pick is parsed and normalized deterministically after consensus so a stray capital letter or code fence can't revert a good prediction.

> **Note on the two equivalence principles:** resolution uses `strict_eq` (there is one correct score); the AI Call uses `prompt_non_comparative` (a prediction is a judgement). Getting this distinction right was the difference between the AI Call working and silently never storing anything.

### What this replaces

| Traditional approach | This project |
|---|---|
| Chainlink or a paid feed for sports scores | Free, read directly from BBC Sport |
| A backend service pushing results on-chain | No backend — the contract resolves itself |
| An admin clicking "resolve" | Fully autonomous, driven by cron |
| A single trusted oracle | Multiple validators reaching consensus |

---

## Architecture

```
                 ┌────────────────────────────────────────────────┐
                 │  Frontend (laliga27-predict.vercel.app)          │
                 │  reads mirror ▼        writes via wallet ▼        │
                 └──────────┬──────────────────────┬────────────────┘
                            │                       │
                   Supabase (read-mirror)     GenLayer Bradbury
                            ▲                  ┌──────────────────┐
                            │                  │ 50 market        │
                            │                  │ contracts (MD1-5)│
        ┌───────────────────┴───────────┐      │ 1 AI predictor   │
        │  Cron (laliga27-predict-cron)  │─wr──▶└──────────────────┘
        │  /api/resolve-matches  10m     │             ▲
        │  /api/predict-matches  30m     │─────────────┘
        │  /api/standings         3h     │──▶ BBC Sport (league table)
        │  /api/live-scores       5m     │──▶ football-data.org (live scores)
        └────────────────────────────────┘
        scheduled by cron-job.org (Bearer CRON_SECRET)
```

**Trust flow:** the contracts are the source of truth. Cron writes to the contracts and mirrors public state into Supabase. The frontend reads Supabase for speed and reads the contracts directly for pools; it only ever writes through the user's own wallet.

---

## Repository layout

```
laliga27-predict/
├── prediction_market.py      # per-match Intelligent Contract (pari-mutuel + BBC resolution)
├── ai_predictor.py           # single AI Call contract (pre-match predictions)
├── deploy.js                 # deploys market contracts (--matchday N, resumable checkpoint)
├── deploy-ai.js              # deploys the AI predictor (one-time)
├── generate_fixtures.py      # pulls real 2026/27 fixtures from football-data.org (PD) → fixtures.json
├── fixtures.json             # MD1–5, 50 fixtures with kickoff times + external IDs
├── schema.sql                # complete Supabase schema + RLS (single paste)
├── frontend/                 # canonical app — vanilla HTML/CSS/JS, no build step
│   ├── index.html
│   ├── app.js                # router, match list, match detail, My Picks, Leaderboard, Table
│   ├── lib/
│   │   ├── config.js         # Bradbury params + Supabase publishable key
│   │   ├── wallet.js         # EIP-6963 wallet chooser + chain guard
│   │   ├── contract.js       # genlayer-js reads/writes against markets
│   │   ├── supabase.js       # read-mirror queries
│   │   └── crests.js         # La Liga club crest mapping (football-data CDN)
│   └── style.css             # theme, light + dark
├── web/                      # secondary Next.js + RainbowKit build of the same app
└── cron/
    ├── api/resolve-matches.js
    ├── api/predict-matches.js
    ├── api/standings.js
    ├── api/live-scores.js
    └── vercel.json
```

---

## The market contract (`prediction_market.py`)

One deployed instance per fixture. Immutable — team names, date and **kickoff time** are set in the constructor (`team1, team2, game_date, kickoff_ts`) and never change.

```python
submit_prediction(pick)   # payable; min 2 GEN; {home,draw,away}; one per wallet; reverts at/after kickoff
resolve()                 # reads BBC + ESPN, reaches consensus, settles the pools
claim()                   # winning predictor pulls their pari-mutuel share (last claimer sweeps dust)
refund()                  # reclaim stake when a match goes to the refund path
mark_postponed()          # permissionless + source-verified; opens refunds only if sources confirm postponement
```

**Betting deadline (irreversible close).** The constructor takes `kickoff_ts` (Unix epoch seconds). `submit_prediction()` reverts at or after it — checked against the consensus transaction time (`gl.message_raw["datetime"]`), so no stake can be placed once the match kicks off, and therefore never once the result is known.

**Postponements are verified, not asserted.** `mark_postponed()` is permissionless (like `resolve()`), callable only while `open` and only after kickoff + a 3h grace window. It re-renders BBC + ESPN and classifies **each source independently** — `postponed` / `finished` / `unknown` (or `unavailable`) — under `strict_eq`, then enforces the policy on-chain: a `finished` result on **either** source reverts (this also rejects a conflict where one source says postponed and the other shows a score); the primary must say postponed and the secondary must agree; if the secondary is unavailable it falls back to **primary-only, but only when the primary is explicit**. Anything ambiguous or conflicting stays `open`, so a loser can't turn a decided match into a refund. There is no admin key that controls funds.

> This is the **v0.3.1** source: the 4-arg constructor with the `kickoff_ts` deadline and the permissionless, source-verified `mark_postponed()` hardened with per-source conflict rejection and the safe missing-secondary policy. It is a byte-for-byte port of EPL v0.3.1 with La Liga-specific team-name examples.

**Payout:**

```
payout = your_stake × (total_pool / winning_pool)
```

No cut is taken. The winning side splits the entire pot in proportion to stake.

**Read views** (used by the UI): `get_match_info()`, `get_pools()`, `get_my_prediction(user)`, `expected_payout(user)`, `get_contract_balance()`.

**Refund edge cases** — either of these routes everyone to `refund()` so nothing is ever stuck:
- **Nobody** picked the winning outcome (winning pool = 0).
- **Everybody** picked the winning outcome (winning pool = whole pot), which would otherwise be a no-op payout.

---

## The AI Call contract (`ai_predictor.py`)

A single contract for the entire season, keyed by the same `match_id` the markets use so the two line up in the UI.

```python
predict(match_id, home, away, date)   # admin/cron only, idempotent per fixture
reset(match_id)                        # admin: clear a prediction to re-run it
set_source(url)                        # admin: change the evidence source
get_prediction(match_id)               # → {has_prediction, pick, confidence, reason, ...}
has_prediction(match_id) / get_source()
```

It holds no funds and never pays out — its blast radius is zero. It exists purely to publish GenLayer's own read on each match before kickoff.

**Deployed at:** _pending deployment_ — run `node deploy-ai.js` and paste the address into `.env` (`AI_PREDICTOR_ADDRESS`), `web/src/lib/config.ts`, and `ai_predictor_address.txt`.

---

## Data & the cron backend

Bradbury reads only reflect **finalized** state, which can lag minutes to hours, so a small cron layer keeps the mirror fresh and drives the autonomous behaviour. All four endpoints require an `Authorization: Bearer <CRON_SECRET>` header and are pinged by [cron-job.org](https://cron-job.org):

| Endpoint | Cadence | What it does |
|---|---|---|
| `/api/resolve-matches` | ~10 min | Submits `resolve()` for finished matches; polls consensus on later ticks; retries stuck ones |
| `/api/predict-matches` | ~30 min | Fires `predict()` on the AI contract ~1 day before kickoff; mirrors stored picks |
| `/api/standings` | ~3 hours | Scrapes the **BBC Sport** La Liga table → `standings` |
| `/api/live-scores` | ~5 min | Pulls live scores from football-data.org, mirrors + broadcasts via Ably |

**On standings:** football-data.org's free tier serves *stale prior-season* standings until the new season actually kicks off. `standings.js` scrapes BBC Sport directly (the same source the contracts resolve against), which carries the correct 2026/27 La Liga clubs. Crests are mapped onto the football-data CDN so badges match the rest of the app.

**Supabase** holds `matches`, `pools`, `users`, `predictions`, `resolutions_log`, `standings`, and `ai_predictions`. RLS allows public reads; all writes go through service-key-only mirror endpoints that verify against the chain. `schema.sql` sets all of it up in one paste.

---

## Frontend & wallet

The canonical frontend (`frontend/`) is deliberately plain: vanilla HTML/CSS/JS, no framework, no build step. Hash router, five views — **Matches**, **Match detail** (with pools + the AI Call panel), **Table**, **My Picks**, **Leaderboard** — with light and dark modes.

**Wallet connection** was the hardest part to get right, and worth explaining because it's a common GenLayer footgun:

- Connection uses an **EIP-6963 wallet chooser** — every installed extension (MetaMask, OKX, Phantom, Rabby, …) announces itself and the user explicitly picks one, instead of the app guessing at `window.ethereum`.
- Before any signed transaction, the app **forces the wallet onto Bradbury (chain 4221)** — trying `wallet_switchEthereumChain`, adding the network on 4902/-32603, then re-reading `eth_chainId` to *verify* rather than trusting the promise.
- Critically, the chosen provider is passed to genlayer-js as a **top-level `provider`** on `createClient`. genlayer-js builds its own transport and ignores a viem-style `transport` key — passing it the wrong way makes it silently fall back to `window.ethereum`, causing both the "wrong wallet" bug and a chain-mismatch error at signing.

`web/` is a secondary Next.js + RainbowKit build of the same app for anyone who prefers that stack. Both talk to the identical contracts and Supabase project.

---

## Running it locally

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env      # fill in the vars below

# 3. Generate the fixtures (live from football-data.org, competition PD)
python generate_fixtures.py

# 4. Set up Supabase — paste schema.sql into the SQL editor once

# 5. Deploy contracts (resumable; a matchday at a time keeps runs short)
node deploy.js --matchday 1
node deploy.js               # or every remaining fixture
node deploy-ai.js            # the AI Call contract (one-time)

# 6. Frontend (no build step)
cd frontend && python -m http.server 8080

# 7. Cron endpoints
cd cron && vercel deploy --prod
```

**Server env (`.env`):**

```
PRIVATE_KEY              # deploy + resolve + predict wallet (must be the AI contract admin)
AI_PREDICTOR_ADDRESS     # deployed AIPredictor address
SUPABASE_URL             # La Liga Supabase project URL
SUPABASE_SERVICE_KEY     # sb_secret_… — backend/cron only, bypasses RLS
FOOTBALL_DATA_API_KEY    # fixtures + live scores (free at football-data.org)
ABLY_API_KEY             # real-time score broadcast
CRON_SECRET              # bearer token cron-job.org sends to the endpoints
```

The frontend also needs the Supabase **publishable** key (`sb_publishable_…`) in `frontend/lib/config.js` — the RLS-restricted key that's safe to ship in the browser.

---

## Tests

The direct-mode contract tests live in `tests/` and focus on exactly what the two review comments demanded:

```bash
python -m pytest tests/ -v            # via the gltest pytest plugin
python tests/test_deadline_and_postpone.py   # standalone, no pytest
```

Coverage:
- late entry after kickoff (at exact kickoff, mid-match, and after full time)
- the deadline is irreversible after resolve
- resolve + claim still pays the winner (happy path intact)
- postponement too early (during the grace window) reverts
- confirmed postponement opens refunds; abandoned-after-play opens refunds
- a finished match cannot be turned into a refund
- conflicting source statuses (either direction) revert
- unavailable secondary: primary-only only when the primary is explicit
- secondary "unknown" stays open

---

## Known limitations / honest caveats

- **Bradbury finality is slow and occasionally stalls.** A stake can sit in `PROPOSING` for minutes to hours before it finalizes, so pools and My Picks update on a lag. This is the testnet, not the app.
- **Only MD1–5 are wired up in `fixtures.json`.** The remaining matchdays (6–38) are a rolling deployment as the season progresses.
- **`fixtures.json` is a generated snapshot.** Re-run `generate_fixtures.py` with a football-data.org key to refresh against the authoritative 2026/27 schedule.
- **AI Call badges are sparse until close to kickoff** — the cron only predicts a fixture ~1 day before it's played.
- **Pre-season the table and leaderboard read zeros** — correct behaviour before any match is played.
- **Resolution reads BBC (primary) + ESPN (secondary)** and only settles when they agree; if ESPN can't be rendered it falls back to BBC alone.
- **Testnet only.** GEN here has no real value. Nothing about this is financial advice or a real-money product.

---

## Roadmap

- [ ] Deploy MD1–5 (50 contracts) on Bradbury
- [ ] AI Call contract + auto-predict cron
- [ ] BBC-sourced live La Liga table
- [x] Resolution logic with two-phase consensus polling + retry (ported)
- [x] Live scores cron + Supabase mirror (ported)
- [x] Wallet chooser, chain-switch guard, end-to-end staking (ported)
- [x] Match list, match detail, AI Call, Table, My Picks, Leaderboard (ported)
- [x] Multi-source resolution cross-check (BBC + ESPN) + team-name normalization (ported)
- [x] Chain-verified Supabase writes (no public forgery of leaderboard rows) (ported)
- [ ] Roll out MD6→MD38 as the season runs

---

## Built with

**GenLayer** (Intelligent Contracts in Python, LLM consensus, in-contract web rendering) · **genlayer-js** · **Vercel** (frontend + serverless cron) · **Supabase** (Postgres read-mirror) · **cron-job.org** (sub-daily scheduling) · **Ably** (real-time broadcasts) · **football-data.org** (fixtures + live scores, competition `PD`) · **BBC Sport** (resolution + league table) · **RainbowKit + wagmi** (the Next.js build) · **vanilla HTML/CSS/JS** (the canonical frontend).

---

Ported from [epl27-predict](https://github.com/Afghanistan8/epl27-predict) — testnet only, no real value.
