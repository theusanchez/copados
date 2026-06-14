# Results ingestion

Fetches FIFA World Cup matches from [football-data.org](https://www.football-data.org/) and
writes them to the Firestore `results` collection that the bolão's ranking/scoring reads.
It reuses the app's own engine (`../../js/engine.js`) to map each fixture to the app's match
IDs (`A1..L6`, `R32_01..FINAL`).

## What it writes

One doc per match at `results/{appMatchId}`:

```jsonc
{
  "status": "scheduled | live | finished",
  "home": 2,            // goals, in the app's home/away orientation (data.js)
  "away": 1,
  "homeTeam": "Brasil", // PT names
  "awayTeam": "Suíça",
  "kickoff": <Timestamp>,
  "penWinner": "Brasil" // knockout only, when drawn at full time
}
```

## Run locally

```bash
cd scripts/results
npm ci   # or: npm install (first run, to create package-lock.json)

export FOOTBALL_DATA_TOKEN="your-football-data-token"
export GOOGLE_APPLICATION_CREDENTIALS="/abs/path/to/service-account.json"
npm run ingest
```

The log prints how many results were written and **lists any API fixtures that couldn't be
mapped** — that list should be empty; if not, a team name needs adding to `teams.js` or the
draw in `../../js/data.js` diverges from the official one.

## Required credentials

### `FOOTBALL_DATA_TOKEN`

1. Sign up at https://www.football-data.org/client/register (free tier covers the World Cup).
2. Copy the API token from your account page.

### Firebase service account

1. Firebase Console → project **copados-a9c73** → ⚙️ Project settings → **Service accounts**.
2. **Generate new private key** → downloads a JSON file.
3. Locally: point `GOOGLE_APPLICATION_CREDENTIALS` at that file.
   In CI: paste the **entire JSON** into the `FIREBASE_SERVICE_ACCOUNT` secret.

## Automation (GitHub Actions)

`.github/workflows/results.yml` runs this on three triggers, fully free — no Firebase Blaze
plan needed. Add two repository secrets under **Settings → Secrets and variables → Actions**:

- `FOOTBALL_DATA_TOKEN` — the football-data.org token.
- `FIREBASE_SERVICE_ACCOUNT` — the full service-account JSON.

Trigger a manual run from the **Actions** tab (Run workflow) to verify before relying on it.

### Near-live trigger (external cron → `repository_dispatch`)

GitHub's own `schedule` is throttled (often ~15-30 min in practice), so it's only a backup
here. For ~1-2 min ingestion, an **external** cron pings GitHub's dispatch API — external
dispatches are not throttled. The data source (football-data.org free tier) refreshes match
records roughly every minute, so this is enough to feel live (no live game-clock minute,
though — that field is paid).

1. Create a **fine-grained GitHub PAT** (Settings → Developer settings → Fine-grained tokens)
   scoped to **only this repo**, with **Repository permissions → Contents: Read and write**
   (that's what authorizes `repository_dispatch`), and an **expiration date**. This is the
   safest option — if it leaks, the blast radius is just this one public repo, and it expires
   on its own. (A classic token with the `public_repo` scope also works but grants write
   access to _all_ your public repos — prefer fine-grained.)
2. On a free cron service (e.g. **cron-job.org**), create a job that runs **every 1 minute**:
   - **URL:** `https://api.github.com/repos/<owner>/copados/dispatches`
   - **Method:** `POST`
   - **Headers:** `Authorization: Bearer <PAT>`, `Accept: application/vnd.github+json`
   - **Body:** `{"event_type":"ingest"}`
3. Confirm runs appear in the **Actions** tab every ~1-2 min. Then flip `FEATURES.liveScores`
   to `true` in `js/features.js` so the live UI matches the now-fresh data.

A successful dispatch returns HTTP **204** (no body).
