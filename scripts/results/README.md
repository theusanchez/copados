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

`.github/workflows/results.yml` runs this every ~10 min (and on manual dispatch), fully free —
no Firebase Blaze plan needed. Add two repository secrets under
**Settings → Secrets and variables → Actions**:

- `FOOTBALL_DATA_TOKEN` — the football-data.org token.
- `FIREBASE_SERVICE_ACCOUNT` — the full service-account JSON.

Trigger a manual run from the **Actions** tab (Run workflow) to verify before relying on cron.
