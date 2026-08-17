# La Liga '27 Predict

**A fully on-chain, pari-mutuel prediction market for the 2026/27 La Liga (Primera División / "LaLiga EA Sports") — settled by AI consensus on [GenLayer](https://genlayer.com) Bradbury testnet, with no oracle, no backend resolver, and no admin keys touching the money.**

🔗 **Live demo:** [laliga27-predict.vercel.app](https://laliga27-predict.vercel.app)

---

## What it does

- Anyone with test GEN can stake on the outcome of any deployed La Liga fixture — **home win, draw, or away win** — with a 2 GEN minimum.
- Every match is its own **Intelligent Contract** holding three pools (home / draw / away). Your stake goes into the pool for your pick.
- After kickoff, the contract **reads the full-time score straight off the web** and resolves itself through validator consensus. Winners split the entire pot pro-rata. No rake, no house edge.
- Separately, GenLayer's validators publish their **own pre-match prediction** ("the AI Call") for each fixture, stored on-chain, shown next to the crowd's pools so you can see where the machine and the market disagree.
- A live **La Liga table** and a **leaderboard** of the sharpest predictors round it out.

Everything the money touches lives on-chain. Supabase is only a fast read-mirror so the UI loads instantly — it is never the source of truth.

The core belief behind the project: **a prediction market shouldn't need a trusted oracle.** GenLayer lets the contract itself read the web and reach consensus on what happened. That's the whole thing.

---

## How it works under the hood

### 1. The contract reads the web itself — from two independent sources

In `prediction_market.py`, resolution renders the live scoreboard *inside* the contract execution, from **two independent sources**: BBC Sport (primary) and ESPN (secondary).

```python
primary   = gl.nondet.web.render(self.resolution_url,   mode="text")  # BBC
secondary = gl.nondet.web.render(self.resolution_url_2, mode="text")  # ESPN
```

There is no oracle service, no off-chain job pushing scores in, no trusted signer. The web pages **are** the source of truth, fetched by the validators at the moment of resolution. The prompt bases the result on the primary, uses the secondary as a cross-check, and returns "not resolved" (leaving the match open) if the two clearly disagree — so a single bad read can't settle a market. Team names are normalized in the prompt ("Atletico"/"Atlético de Madrid" = "Atletico Madrid", "Athletic Bilbao" = "Athletic Club", "Barça" = "Barcelona", …) so spelling differences between sources still match the same fixture.

### 2. AI consensus turns a messy web page into a settled result

The score is extracted by an LLM, and the result only finalizes if the validators independently agree on the same structured answer:

```python
result_json = gl.eq_principle.strict_eq(get_match_result)
```

A final score is an objective fact, so resolution uses **strict equivalence** — every validator must arrive at the identical `{score, winner}` JSON or nothing is written. If the match hasn't finished, `winner` comes back `-1` and the contract simply stays open to retry later.

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

> **The two equivalence principles:** resolution uses `strict_eq` (there is one correct score); the AI Call uses `prompt_non_comparative` (a prediction is a judgement).

### What this replaces

| Traditional approach | This project |
|---|---|
| Chainlink or a paid feed for sports scores | Free, read directly from the web (BBC + ESPN) |
| A backend service pushing results on-chain | No backend — the contract resolves itself |
| An admin clicking "resolve" | Fully autonomous, driven by cron |
| A single trusted oracle | Multiple validators reaching consensus |

---

## Betting integrity & security

Two design constraints keep the market honest, both enforced **on-chain** with no privileged key:

**Fixture-specific betting deadline (irreversible close).** The constructor takes `kickoff_ts` (Unix epoch seconds, immutable). `submit_prediction()` reverts at or after it — checked against the consensus transaction time (`gl.message_raw["datetime"]`), so no stake can be placed once the match kicks off, and therefore never once the result is known.

**Postponements are verified, not asserted.** `mark_postponed()` is permissionless (like `resolve()`), callable only while a market is `open` and only after kickoff + a 3-hour grace window. It re-renders BBC + ESPN and classifies **each source independently** — `postponed` / `finished` / `unknown` (or `unavailable`) — under `strict_eq`, then enforces the policy on-chain:

- A `finished` result on **either** source reverts (this also rejects a conflict where one source says postponed and the other shows a score) — a decided match can never be turned into a refund.
- The primary (authoritative) source must itself say postponed, and the secondary must agree.
- If the secondary is unavailable, it falls back to **primary-only, but only when the primary is explicit** (contains an explicit postponed / called-off / cancelled / suspended / abandoned wording).
- A suspended / abandoned fixture with no full-time score is treated as postponed; anything ambiguous or conflicting stays `open`.

Because there is no admin key that controls funds, the only reachable outcomes are a normal pari-mutuel settlement or a universal 1:1 refund. The full policy is covered by the tests in `tests/` (late entry after kickoff, cancellation after play begins, conflicting sources, unavailable secondary, suspended/abandoned).

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
                            │                  │ per-match market  │
                            │                  │ contracts         │
        ┌───────────────────┴───────────┐      │ 1 AI predictor    │
        │  Cron (laliga27-predict-cron)  │─wr──▶└──────────────────┘
        │  /api/resolve-matches  ~10m    │             ▲
        │  /api/predict-matches  ~30m    │─────────────┘
        │  /api/standings         ~3h    │──▶ BBC Sport (league table)
        │  /api/live-scores       ~5m    │──▶ football-data.org (live scores)
        └────────────────────────────────┘
```

**Trust flow:** the contracts are the source of truth. Cron writes to the contracts and mirrors public state into Supabase. The frontend reads Supabase for speed and reads the contracts directly for pools; it only ever writes through the user's own wallet, and even those mirror writes are re-verified against the chain server-side, so nobody can forge leaderboard rows.

---

## Repository layout

```
laliga27-predict/
├── prediction_market.py      # per-match Intelligent Contract (pari-mutuel + BBC/ESPN resolution)
├── ai_predictor.py           # single AI Call contract (pre-match predictions)
├── deploy.js                 # deploys market contracts (--matchday N, resumable, skips kicked-off fixtures)
├── deploy-ai.js              # deploys the AI predictor (one-time)
├── generate_fixtures.py      # pulls 2026/27 fixtures from football-data.org (competition PD) → fixtures.json
├── fixtures.json             # fixtures with kickoff times + external IDs
├── schema.sql                # complete Supabase schema + RLS (single paste)
├── frontend/                 # canonical app — vanilla HTML/CSS/JS, no build step
│   ├── index.html
│   ├── app.js                # router, match list, match detail, My Picks, Leaderboard, Table
│   ├── lib/                  # config, wallet (EIP-6963), contract (genlayer-js), supabase, crests
│   └── style.css             # emerald-on-slate theme, light + dark
├── web/                      # secondary Next.js + RainbowKit build of the same app
└── cron/
    ├── api/resolve-matches.js · predict-matches.js · standings.js · live-scores.js
    ├── api/mirror-prediction.js · set-username.js   # chain-verified Supabase writes
    └── vercel.json
```

---

## The market contract (`prediction_market.py`)

One deployed instance per fixture. Immutable — team names, date and kickoff time are set in the constructor (`team1, team2, game_date, kickoff_ts`) and never change.

```python
submit_prediction(pick)   # payable; min 2 GEN; {home,draw,away}; one per wallet; reverts at/after kickoff
resolve()                 # reads BBC + ESPN, reaches consensus, settles the pools
claim()                   # winning predictor pulls their pari-mutuel share (last claimer sweeps the rounding dust)
refund()                  # reclaim stake when a match goes to the refund path
mark_postponed()          # permissionless + source-verified; opens refunds only if the sources confirm postponement
```

**Payout:** `payout = your_stake × (total_pool / winning_pool)`. No cut is taken; the winning side splits the entire pot in proportion to stake. Integer-division dust is swept to the final claimant so nothing is ever locked.

**Read views** (used by the UI): `get_match_info()`, `get_pools()`, `get_my_prediction(user)`, `expected_payout(user)`, `get_contract_balance()`.

**Refund edge cases** — either routes everyone to `refund()` so nothing is ever stuck: nobody picked the winning outcome (winning pool = 0), or everybody did (winning pool = whole pot).

---

## The AI Call contract (`ai_predictor.py`)

A single contract for the entire season, keyed by the same `match_id` the markets use so the two line up in the UI.

```python
predict(match_id, home, away, date)   # admin/cron only, idempotent per fixture
reset(match_id)                        # admin: clear a prediction to re-run it
set_source(url)                        # admin: change the evidence source
get_prediction(match_id) / has_prediction(match_id) / get_source()
```

It holds no funds and never pays out — its blast radius is zero. It exists purely to publish GenLayer's own read on each match before kickoff.

**Deployed at:** `0x7b157df9e40dE5B3EC487A7210e9cFf234199ecD` (Bradbury)

---

## Deployed markets — the public register

Every match's on-chain contract address is committed to [`deploy_checkpoint.json`](./deploy_checkpoint.json) — one JSON object mapping `match_id → contract_address` for every deployed market. It's the public register of what's live: paste any address into the [Bradbury explorer](https://explorer-bradbury.genlayer.com) to read `get_match_info()` / `get_pools()` directly on-chain. Fixtures whose kickoff has already passed are not deployed (betting would be closed), so the checkpoint grows as the season rolls forward.

---

## Data & the cron backend

Bradbury reads only reflect **finalized** state, which can lag minutes to hours, so a small cron layer keeps the mirror fresh and drives the autonomous behaviour. All endpoints require an `Authorization: Bearer <CRON_SECRET>` header and are pinged on a schedule (e.g. via [cron-job.org](https://cron-job.org)):

| Endpoint | Cadence | What it does |
|---|---|---|
| `/api/resolve-matches` | ~10 min | Submits `resolve()` for finished matches; polls consensus on later ticks; retries stuck ones |
| `/api/predict-matches` | ~30 min | Fires `predict()` on the AI contract ~1 day before kickoff; mirrors stored picks |
| `/api/standings` | ~3 hours | Scrapes the **BBC Sport** La Liga table → `standings` |
| `/api/live-scores` | ~5 min | Pulls live scores from football-data.org, mirrors + broadcasts via Ably |

**On standings:** football-data.org's free tier serves *stale prior-season* standings until the new season actually kicks off, so `standings.js` scrapes BBC Sport directly (the same source the contracts resolve against), which carries the correct 2026/27 La Liga clubs. Crests are mapped onto the football-data CDN so badges match the rest of the app.

**Supabase** holds `matches`, `pools`, `users`, `predictions`, `resolutions_log`, `standings`, and `ai_predictions`. RLS allows public reads; all writes go through service-key-only endpoints that verify against the chain. `schema.sql` sets it all up in one paste.

---

## Frontend & wallet

The canonical frontend (`frontend/`) is deliberately plain: vanilla HTML/CSS/JS, no framework, no build step. Hash router, five views — **Matches**, **Match detail** (pools + the AI Call panel), **Table**, **My Picks**, **Leaderboard** — with light and dark modes.

**Wallet connection** is the part most worth explaining, because it's a common GenLayer footgun:

- Connection uses an **EIP-6963 wallet chooser** — every installed extension (MetaMask, OKX, Phantom, Rabby, …) announces itself and the user explicitly picks one, instead of the app guessing at `window.ethereum`.
- Before any signed transaction, the app **forces the wallet onto Bradbury (chain 4221)** — trying `wallet_switchEthereumChain`, adding the network on 4902 / -32603, then re-reading `eth_chainId` to *verify* rather than trusting the promise.
- The chosen provider is passed to genlayer-js as a **top-level `provider`** on `createClient`. genlayer-js builds its own transport and ignores a viem-style `transport` key — passing it the wrong way makes it silently fall back to `window.ethereum`, which is what causes both the "wrong wallet" bug and a chain-mismatch error at signing.

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

# 5. Deploy contracts (resumable; already-kicked-off fixtures are skipped automatically)
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
SUPABASE_URL             # Supabase project URL
SUPABASE_SERVICE_KEY     # sb_secret_… — backend/cron only, bypasses RLS
FOOTBALL_DATA_API_KEY    # fixtures + live scores (free at football-data.org)
ABLY_API_KEY             # real-time score broadcast (optional)
CRON_SECRET              # bearer token the cron endpoints require
```

The frontend also needs the Supabase **publishable** key (`sb_publishable_…`) in `frontend/lib/config.js` — the RLS-restricted key that's safe to ship in the browser.

---

## Tests

Direct-mode contract tests live in `tests/`:

```bash
python -m pytest tests/ -v                     # via the gltest pytest plugin
python tests/test_deadline_and_postpone.py     # standalone, no pytest
```

They cover the betting deadline (late entry at exact kickoff, mid-match, and after full time; irreversibility after resolve), the happy resolve→claim path, and the full postponement policy (too-early revert, confirmed postponement, abandoned-after-play, a finished match that can't be refunded, conflicting sources both directions, unavailable secondary, and "unknown" secondary).

---

## Known limitations / honest caveats

- **Bradbury finality is slow and occasionally stalls.** A stake can sit in `PROPOSING` for minutes to hours before it finalizes, so pools and My Picks update on a lag. This is the testnet, not the app.
- **Markets are deployed in waves.** Fixtures whose kickoff has already passed are skipped (betting would be closed), so only upcoming matches get a market.
- **AI Call badges are sparse until close to kickoff** — the cron only predicts a fixture ~1 day before it's played.
- **Resolution reads BBC (primary) + ESPN (secondary)** and only settles when they agree; if ESPN can't be rendered it falls back to BBC alone.
- **Testnet only.** GEN here has no real value. Nothing about this is financial advice or a real-money product.

---

## Built with

**GenLayer** (Intelligent Contracts in Python, LLM consensus, in-contract web rendering) · **genlayer-js** · **Vercel** (frontend + serverless cron) · **Supabase** (Postgres read-mirror) · **cron-job.org** (sub-daily scheduling) · **Ably** (real-time broadcasts) · **football-data.org** (fixtures + live scores, competition `PD`) · **BBC Sport + ESPN** (dual-source resolution) · **RainbowKit + wagmi** (the Next.js build) · **vanilla HTML/CSS/JS** (the canonical frontend).

---

Built on GenLayer Bradbury — testnet only, no real value.
