# CLAUDE.md

Guide for AI assistants (and humans) working in this repo. Read this first.

## What this is

**Copa 2026 — Palpites**: a World Cup 2026 prediction-pool (bolão) PWA. Users predict
every match scoreline (group stage + knockout), compare with friends, and climb a
ranking. Deployed as a static site on **GitHub Pages from `main`**
(`https://theusanchez.github.io/copados`).

## Stack

- **Vanilla ES modules. No framework, no bundler, no build step.** The browser loads
  `js/app.js` directly. Keep it that way unless there's a strong reason not to.
- **Firebase** (loaded from the gstatic CDN in `js/firebase-backend.js`): Google auth +
  Firestore.
- **PWA**: `manifest.webmanifest` + `sw.js` (service worker, app-shell cache).
- **Tests**: Playwright E2E (`tests/e2e/`) + Node unit tests for the ingester
  (`scripts/results/`).

## Commands

```bash
npm install                     # installs @playwright/test (dev only)
npx playwright install chromium # once
npx playwright test             # run the full E2E suite
npx playwright test venue       # run one spec
node --test scripts/results/    # ingester unit tests (diff logic)
```

There is no build. To preview locally: serve the folder statically
(`python3 -m http.server 4173`) and open it. The Playwright config already starts a
static server on :4173.

## File map

- `index.html` — single page; all views are sections toggled by `app.js`.
- `js/app.js` — all rendering + UI state. The big one.
- `js/engine.js` — **pure** scoring + bracket-resolution logic. Unit-testable; no DOM.
- `js/data.js` — the tournament: `GROUPS` (real 2026 draw) + `KNOCKOUT` bracket + flags.
- `js/venues.js` — the 16 real WC2026 stadiums + `MATCH_VENUE` (venue per fixture).
- `js/db.js` — backend **facade**. Picks the real or fake backend (see test seam).
- `js/firebase-backend.js` — real Firestore/auth implementation.
- `js/fake-backend.js` — in-memory implementation used only under `?e2e=1`.
- `js/config.js` — Firebase web config (public keys; safe to commit).
- `sw.js` — service worker.
- `scripts/results/` — the results ingester (Node + firebase-admin). See its README.
- `tests/e2e/` — Playwright specs + `helpers.js` (seeding).

## The E2E test seam (important)

Loading the app with **`?e2e=1`** makes `js/db.js` swap the Firebase backend for an
in-memory fake (`js/fake-backend.js`). This is how the app is tested end-to-end
without real Firebase or Google login. Tests seed state by writing the `e2e_seed`
localStorage key (via `page.addInitScript`) **before** navigating — see
`tests/e2e/helpers.js` (`boot`, `seed`, `user`, `fullPreds`). The service worker is
also disabled under `?e2e=1`.

When you add a backend method, add it to **all three**: `firebase-backend.js`,
`fake-backend.js`, and the `db.js` facade.

## Firestore data model

- `users/{uid}` — `{ uid, displayName, email, photoURL, knockoutResetVersion }`.
- `predictions/{uid}/matches/{matchId}` — `{ home, away, penWinner? }`.
- `results/{matchId}` — `{ status, home, away, homeTeam, awayTeam, kickoff, penWinner? }`
  written by the ingester. `status` ∈ `scheduled | live | paused | finished`.
- `leagues/{leagueId}` — `{ id, name, code, ownerUid, memberUids[] }` (private leagues).

Match IDs: `A1`..`L6` (group), `R32_01`..`R32_16`, `R16_01`..`R16_08`, `QF_01`..`QF_04`,
`SF_01`, `SF_02`, `THIRD`, `FINAL`.

Scoring (`engine.js`): exact scoreline = **5**, correct outcome = **3**, else 0.
Knockout only scores when the predicted matchup equals the real one.

## Gotchas / hard-won lessons

- **`js/data.js` is the REAL official 2026 draw** — not simulated. Verified vs Wikipedia
  / NBC. Don't "fix" the teams.
- **Knockout bracket flow** follows the official 2026 bracket (matched slot-by-slot).
  If you ever restructure the knockout, bump `KNOCKOUT_RESET_VERSION` in `app.js` — that
  triggers a one-off server-side wipe of users' stale knockout picks + a notice banner
  (`getResetVersion`/`setResetVersion`/`deletePreds`, version stored on the user doc).
- **Service worker**: bump `VERSION` in `sw.js` whenever you change a cached asset. The
  fetch strategy is **network-first for HTML/JS/CSS** (so deploys are picked up) and
  stale-while-revalidate for other assets. **Do NOT add `?v=` query strings to asset
  URLs** in `index.html` — a past attempt crashed the app (fresh entry module importing a
  stale dependency). Rely on the SW for freshness.
- **Live updates are real-time** via a Firestore `onSnapshot` listener (`watchResults`),
  not polling — billed per changed doc. Don't reintroduce client polling.
- **GitHub Actions cron is unreliable**: configured `*/3` but GitHub's floor is 5 min and
  in practice it runs every ~10–30 min and may skip. Free on this (public) repo. Truly
  real-time live scores would need a different mechanism (external cron / always-on
  poller / paid API webhook).
- **football-data.org free tier** is flaky and lags (may not promptly report
  `PAUSED`/`FINISHED`); the ingester retries fetches with backoff.

## Conventions

- English everywhere in code/comments/commits. UI copy is pt-BR.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `perf:`, `ci:`, `docs:`).
- Surgical changes; match existing patterns; no dead code / commented-out blocks.
- Pure logic goes in `engine.js` / `venues.js` (testable); DOM/rendering in `app.js`.
- Every user-facing change should ship with an E2E spec; run the suite before pushing.
