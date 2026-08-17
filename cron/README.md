# La Liga Predict — Live Scores Cron (Vercel)

Vercel-hosted cron that polls football-data.org every minute during match windows, updates Supabase, broadcasts via Ably.

## Files

```
laliga27-predict-cron/
├── api/
│   └── live-scores.js     ← the HTTP handler
├── vercel.json            ← cron schedule (every minute)
├── package.json
└── README.md
```

## Deploy in 5 minutes

### 1. Install Vercel CLI (if needed)

```bash
npm install -g vercel
```

### 2. Login

```bash
vercel login
```

Email login. Follow the link they send.

### 3. Deploy

From inside the `laliga27-predict-cron` folder:

```bash
vercel
```

Vercel will:
- Ask if you want to link a new project (Yes)
- Ask the project name (`laliga27-predict-cron` is fine)
- Auto-detect Node — accept defaults
- Deploy to a preview URL

### 4. Add environment variables

Go to [vercel.com/dashboard](https://vercel.com/dashboard) → click your project → **Settings** → **Environment Variables**.

Add these four:

| Key | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase secret key (sb_secret_...) |
| `FOOTBALL_DATA_API_KEY` | Your football-data.org API token |
| `ABLY_API_KEY` | Your Ably root API key |
| `CRON_SECRET` | Any random string — e.g. output of `openssl rand -hex 16` |

Make sure each is set for "Production" environment.

### 5. Redeploy to apply env vars

```bash
vercel --prod
```

### 6. Test the endpoint

The cron will auto-run once per minute. To trigger manually:

```bash
curl https://YOUR-DEPLOY.vercel.app/api/live-scores \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{ "ok": true, "message": "no matches in window", "changed": 0 }
```

Once the La Liga season starts, the response will include the matches updated each tick.

## Cron schedule

Vercel cron jobs have a minimum interval of **1 minute** on the free tier. The `vercel.json` is configured for `*/1 * * * *` (every minute).

If you need 30-second polling, options are:
- Vercel Pro plan (allows smaller intervals)
- Two cron jobs offset by 30 seconds (hacky but works)
- Run a long-lived worker elsewhere (e.g. on a $5/month VPS)

For MVP, 1-minute polling is fine — most score changes (goals, half-time, full-time) aren't time-sensitive to the second.

## Monitoring

In Vercel dashboard → your project → **Logs**. You'll see each cron invocation with its response. Failed crons surface as errors here.
