# Squads build

Fetches every World Cup 2026 squad (players + coach) from
[football-data.org](https://www.football-data.org/) and bakes them into the static
module **`../../js/squads.js`** that the app imports at runtime. Squads barely change
during a tournament, so this is run **manually/occasionally** — there are no API calls
or Firestore reads in production, just a committed file served by the static host.

Team identities are mapped to the app's PT names by reusing `../results/teams.js`.

## What it writes

`js/squads.js`:

```js
export const SQUADS = {
  Brasil: {
    coach: "Carlo Ancelotti",
    coachNat: "Italy",
    crest: "https://crests.football-data.org/764.svg",
    players: [{ name: "Alisson Becker", group: "GOL", dob: "1992-10-02" }],
  },
};
```

`group` ∈ `GOL | DEF | MEI | ATA` (goalkeeper / defence / midfield / offence).

## Run

```bash
cd scripts/squads
export FOOTBALL_DATA_TOKEN="your-football-data-token"
npm run build   # or: node build-squads.js
```

The free tier is rate-limited (~10 req/min), so requests are spaced ~6.5s apart — the
full run over 48 teams takes ~5 min. The log lists any teams that came back with an
**empty squad** (source didn't have them yet) or any **unmapped** API team (add it to
`../results/teams.js`).

## Notes

- No `firebase-admin` dependency — this script only fetches and writes a file.
- Historical honours (titles, appearances, best run) are **not** in the API; they live
  as static data in `../../js/data.js` (`HONOURS`).
- After rebuilding, bump `VERSION` in `../../sw.js` so clients pick up the new file.
