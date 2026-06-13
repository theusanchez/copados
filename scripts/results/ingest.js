// Fetches FIFA World Cup matches from football-data.org and writes them to the
// Firestore `results` collection, keyed by the app's match IDs (A1..L6, R32_01..FINAL),
// in the shape consumed by js/engine.js + js/app.js.
//
// Run: FOOTBALL_DATA_TOKEN=... and credentials (see README) then `npm run ingest`.

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { GROUPS, KNOCKOUT } from '../../js/data.js';
import { computeAdvancing, buildKnockoutMatches } from '../../js/engine.js';
import { toPt } from './teams.js';
import { resultChanged } from './diff.js';

const API_URL = 'https://api.football-data.org/v4/competitions/WC/matches';
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;

const VALID_TEAMS = new Set(Object.values(GROUPS).flatMap(g => g.teams));
const ROUND_ORDER = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];

// --- helpers ---------------------------------------------------------------

function mapStatus(s) {
  if (s === 'IN_PLAY') return 'live';
  if (s === 'PAUSED') return 'paused'; // halftime / stoppage break
  if (s === 'FINISHED') return 'finished';
  return 'scheduled';
}

function samePair(a, b) {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

function describe(m) {
  const h = m.homeTeam?.name ?? 'TBD', a = m.awayTeam?.name ?? 'TBD';
  return `${m.stage}${m.group ? '/' + m.group : ''}: ${h} x ${a} (#${m.id})`;
}

function kickoffTs(m) {
  return m.utcDate ? admin.firestore.Timestamp.fromDate(new Date(m.utcDate)) : null;
}

// Build the stored doc for a group match, oriented to the app's home/away.
function groupDoc(appMatch, m, homePt, awayPt) {
  const fh = m.score?.fullTime?.home ?? null;
  const fa = m.score?.fullTime?.away ?? null;
  const appIsApiHome = appMatch.home === homePt;
  return {
    status: mapStatus(m.status),
    home: appIsApiHome ? fh : fa,
    away: appIsApiHome ? fa : fh,
    homeTeam: appMatch.home,
    awayTeam: appMatch.away,
    kickoff: kickoffTs(m),
  };
}

// Build the stored doc for a knockout match, kept in the API's home/away orientation.
function koDoc(m, homePt, awayPt) {
  const status = mapStatus(m.status);
  const home = m.score?.fullTime?.home ?? null;
  const away = m.score?.fullTime?.away ?? null;
  let penWinner = null;
  if (status === 'finished' && home != null && home === away) {
    if (m.score?.winner === 'HOME_TEAM') penWinner = homePt;
    else if (m.score?.winner === 'AWAY_TEAM') penWinner = awayPt;
  }
  return { status, home, away, homeTeam: homePt, awayTeam: awayPt, kickoff: kickoffTs(m), penWinner };
}

// --- credentials -----------------------------------------------------------

function loadCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.credential.cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')));
  }
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT (JSON) or GOOGLE_APPLICATION_CREDENTIALS (path).');
}

// --- main ------------------------------------------------------------------

async function main() {
  if (!TOKEN) throw new Error('Missing FOOTBALL_DATA_TOKEN.');

  const res = await fetch(API_URL, { headers: { 'X-Auth-Token': TOKEN } });
  if (!res.ok) throw new Error(`football-data.org ${res.status}: ${await res.text()}`);
  const { matches = [] } = await res.json();

  // Diagnostic: raw API status for in-play matches, to confirm whether the source
  // reports PAUSED (halftime). Visible in the Actions run logs.
  const liveApi = matches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
  if (liveApi.length) {
    console.log('Live per API: ' + liveApi
      .map(m => `${m.homeTeam?.name} x ${m.awayTeam?.name} [${m.status}${m.minute != null ? ' ' + m.minute + "'" : ''}]`)
      .join(' | '));
  }

  const docs = {};       // appMatchId -> result doc
  const unmapped = [];

  // 1) Group stage: match by group letter + unordered team pair.
  for (const m of matches) {
    if (m.stage !== 'GROUP_STAGE') continue;
    const homePt = toPt(m.homeTeam), awayPt = toPt(m.awayTeam);
    if (!homePt || !awayPt) { unmapped.push(describe(m)); continue; }
    const letter = (m.group || '').split('_').pop();
    const grp = GROUPS[letter];
    const appMatch = grp?.matches.find(x => samePair([x.home, x.away], [homePt, awayPt]));
    if (!appMatch) { unmapped.push(describe(m)); continue; }
    docs[appMatch.id] = groupDoc(appMatch, m, homePt, awayPt);
  }

  // 2) Knockout: rebuild the real bracket with the app's own engine from finished
  //    group results, then match each round's slots to API fixtures by team pair.
  const realGroupPreds = {};
  for (const [id, d] of Object.entries(docs)) {
    if (d.status === 'finished' && d.home != null && d.away != null) {
      realGroupPreds[id] = { home: d.home, away: d.away };
    }
  }
  const adv = computeAdvancing(realGroupPreds);

  const apiKo = matches
    .filter(m => m.stage !== 'GROUP_STAGE')
    .map(m => ({ m, homePt: toPt(m.homeTeam), awayPt: toPt(m.awayTeam) }));
  const usedApi = new Set();
  const koResults = {};

  for (const round of ROUND_ORDER) {
    const bracket = buildKnockoutMatches(adv, koResults);
    for (const slot of KNOCKOUT[round]) {
      const exp = bracket[slot.id];
      if (!VALID_TEAMS.has(exp.homeTeam) || !VALID_TEAMS.has(exp.awayTeam)) continue; // unresolved
      const found = apiKo.find(k =>
        k.homePt && k.awayPt && !usedApi.has(k.m.id) &&
        samePair([k.homePt, k.awayPt], [exp.homeTeam, exp.awayTeam])
      );
      if (!found) continue;
      usedApi.add(found.m.id);
      const d = koDoc(found.m, found.homePt, found.awayPt);
      docs[slot.id] = d;
      if (d.status === 'finished' && d.home != null && d.away != null) {
        koResults[slot.id] = {
          home: d.home, away: d.away, homeTeam: d.homeTeam, awayTeam: d.awayTeam, penWinner: d.penWinner,
        };
      }
    }
  }

  // KO fixtures the API has (with resolvable teams) but we couldn't place in a slot.
  for (const k of apiKo) {
    if (k.homePt && k.awayPt && !usedApi.has(k.m.id) &&
        VALID_TEAMS.has(k.homePt) && VALID_TEAMS.has(k.awayPt)) {
      unmapped.push(describe(k.m));
    }
  }

  // 3) Persist only what changed — keeps writes (and the live listeners' read cost)
  //    proportional to actual updates instead of rewriting every doc each run.
  const db = admin.firestore();
  const existingSnap = await db.collection('results').get();
  const existing = {};
  existingSnap.forEach(d => { existing[d.id] = d.data(); });

  const batch = db.batch();
  let writes = 0;
  for (const [id, d] of Object.entries(docs)) {
    if (!resultChanged(existing[id], d)) continue;
    batch.set(
      db.collection('results').doc(id),
      { ...d, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    writes++;
  }
  if (writes) await batch.commit();

  const finished = Object.values(docs).filter(d => d.status === 'finished').length;
  console.log(`Wrote ${writes} changed result(s) of ${Object.keys(docs).length} mapped (${finished} finished). API returned ${matches.length} matches.`);
  if (unmapped.length) {
    console.warn(`\n${unmapped.length} API match(es) not mapped to an app ID (check draw/team names):`);
    unmapped.forEach(u => console.warn('  - ' + u));
  }
}

admin.initializeApp({ credential: loadCredential() });
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
