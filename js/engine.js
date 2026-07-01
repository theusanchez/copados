import { GROUPS, KNOCKOUT } from './data.js';
import { THIRDS_TABLE, THIRDS_SLOT_ORDER } from './thirds-table.js';

// Compute standings for one group given { matchId: {home:N, away:N} }
export function groupStandings(groupKey, preds) {
  const group = GROUPS[groupKey];
  const s = {};
  group.teams.forEach(t => { s[t] = {team:t, pts:0, gf:0, ga:0, gd:0, played:0}; });
  group.matches.forEach(m => {
    const p = preds[m.id];
    if (p == null || p.home == null || p.away == null) return;
    const h = Number(p.home), a = Number(p.away);
    if (isNaN(h) || isNaN(a)) return;
    s[m.home].gf += h; s[m.home].ga += a; s[m.home].gd += h - a; s[m.home].played++;
    s[m.away].gf += a; s[m.away].ga += h; s[m.away].gd += a - h; s[m.away].played++;
    if (h > a)       { s[m.home].pts += 3; }
    else if (h === a) { s[m.home].pts += 1; s[m.away].pts += 1; }
    else              { s[m.away].pts += 3; }
  });
  return Object.values(s).sort((a, b) =>
    b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team)
  );
}

// Compute all group standings and determine advancing teams
export function computeAdvancing(preds) {
  const all = {};
  Object.keys(GROUPS).forEach(g => { all[g] = groupStandings(g, preds); });

  const winners = {}, runners = {};
  const thirds = [];
  Object.keys(all).forEach(g => {
    winners[g] = all[g][0]?.team || `1° Grupo ${g}`;
    runners[g] = all[g][1]?.team || `2° Grupo ${g}`;
    if (all[g][2]) thirds.push({ group: g, ...all[g][2] });
  });

  thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.group.localeCompare(b.group));
  const bestThirds = thirds.slice(0, 8);

  return { all, winners, runners, thirds, bestThirds };
}

// Resolve a slot to a team name given advancing info + previous knockout results
export function resolveSlot(slot, adv, koResults) {
  if (slot.type === 'w')  return adv.winners[slot.group] || `1° ${slot.group}`;
  if (slot.type === 'ru') return adv.runners[slot.group] || `2° ${slot.group}`;
  if (slot.type === 'b3') {
    const eligible = adv.bestThirds.filter(t => slot.groups.includes(t.group));
    return eligible[0]?.team || `3° (${slot.groups.join('/')})`;
  }
  if (slot.type === 'mw') {
    const r = koResults[slot.id];
    if (!r || r.home == null || r.away == null) return '?';
    const h = Number(r.home), a = Number(r.away);
    if (isNaN(h) || isNaN(a)) return '?';
    if (h === a) return r.penWinner || '?';
    return h > a ? r.homeTeam : r.awayTeam;
  }
  if (slot.type === 'ml') {
    const r = koResults[slot.id];
    if (!r || r.home == null || r.away == null) return '?';
    const h = Number(r.home), a = Number(r.away);
    if (isNaN(h) || isNaN(a)) return '?';
    if (h === a) return r.penWinner === r.homeTeam ? r.awayTeam : r.homeTeam;
    return h < a ? r.homeTeam : r.awayTeam;
  }
  return '?';
}

// Build full knockout match list with resolved team names
// koResults: { matchId: { home:N, away:N, homeTeam:string, awayTeam:string, penWinner?:string } }
export function buildKnockoutMatches(adv, koResults) {
  const resolved = {};
  const usedThirds = new Set(); // each 3rd-place team can only fill one slot

  // Official FIFA allocation of the 8 best third-placed teams to the winner slots
  // (Annex C, the 495-combination table in THIRDS_TABLE), keyed by which 8 groups
  // produced a qualifying third. The greedy eligibility below is only a fallback for
  // partial/preview brackets where the full set of 8 thirds isn't resolved yet.
  const thirdByGroup = {};
  adv.bestThirds.forEach(t => { thirdByGroup[t.group] = t.team; });
  const qGroups = adv.bestThirds.map(t => t.group).sort().join('');
  const tableRow = adv.bestThirds.length === 8 ? THIRDS_TABLE[qGroups] : null;
  const b3Slot = {}; // matchId -> the third-place team officially assigned to it
  if (tableRow) {
    THIRDS_SLOT_ORDER.forEach((id, i) => {
      const team = thirdByGroup[tableRow[i]];
      if (team) b3Slot[id] = team;
    });
  }

  function resolveSlotTracked(slot, matchId) {
    if (slot.type === 'b3') {
      if (b3Slot[matchId]) { usedThirds.add(b3Slot[matchId]); return b3Slot[matchId]; }
      const eligible = adv.bestThirds.filter(
        t => slot.groups.includes(t.group) && !usedThirds.has(t.team)
      );
      // fallback: any unused best-third when no eligible match found
      const anyUnused = adv.bestThirds.filter(t => !usedThirds.has(t.team));
      const picked = eligible[0] ?? anyUnused[0];
      if (picked) { usedThirds.add(picked.team); return picked.team; }
      return '?';
    }
    return resolveSlot(slot, adv, resolved);
  }

  const rounds = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];
  rounds.forEach(round => {
    KNOCKOUT[round].forEach(match => {
      const homeTeam = resolveSlotTracked(match.home, match.id);
      const awayTeam = resolveSlotTracked(match.away, match.id);
      const r = koResults[match.id] || {};
      resolved[match.id] = {
        ...match,
        homeTeam,
        awayTeam,
        home: r.home ?? null,
        away: r.away ?? null,
        penWinner: r.penWinner ?? null,
      };
    });
  });
  return resolved;
}

// Resolve a user's full knockout bracket (teams + their predicted scores) from preds.
export function resolveKnockout(preds) {
  const adv = computeAdvancing(preds);
  const koResults = {};
  Object.values(KNOCKOUT).flat().forEach(m => {
    if (preds[m.id]) koResults[m.id] = preds[m.id];
  });
  return buildKnockoutMatches(adv, koResults);
}

// -----------------------------------------------------------------------
// Scoring: exact score = 5, correct outcome = 3, otherwise 0
// -----------------------------------------------------------------------
const GROUP_IDS = new Set(Object.values(GROUPS).flatMap(g => g.matches.map(m => m.id)));

// The knockout points only count once the group stage is settled for this user:
// every group match is either predicted or already finished. Strict "all predicted"
// would permanently void the knockout of anyone who joined after some group games
// started (they can't predict a played match), so finished games count as settled.
export function groupStageScorable(preds, results) {
  return Object.values(GROUPS).flatMap(g => g.matches).every(m => {
    const p = preds[m.id];
    if (p && p.home != null && p.away != null) return true;
    const r = results[m.id];
    return !!r && r.status === 'finished';
  });
}

// Kept exported so an app.js cached from a previous deploy (which still does
// `import { groupsComplete }`) keeps linking against this module. Removing an
// export breaks mixed-cache loads under the service worker (white screen) — see the
// SW gotcha in CLAUDE.md. The live code uses groupStageScorable / groupStageReady.
export function groupsComplete(preds) {
  return Object.values(GROUPS).flatMap(g => g.matches).every(m => {
    const p = preds[m.id];
    return p && p.home != null && p.away != null;
  });
}

function scorelinePoints(ph, pa, rh, ra, exact = 5, outcome = 3) {
  if (ph == null || pa == null || rh == null || ra == null) return 0;
  ph = Number(ph); pa = Number(pa); rh = Number(rh); ra = Number(ra);
  if (ph === rh && pa === ra) return exact;
  return Math.sign(ph - pa) === Math.sign(rh - ra) ? outcome : 0;
}

function sameTeams(a, b) {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

// A slot is "cravado" when the predicted bracket nails the real matchup (both teams)
// AND carries a committed scoreline behind it. Only then is there a 5/3 pick to freeze.
function isCravado(km, r) {
  return !!(km && km.home != null && km.away != null &&
    sameTeams([km.homeTeam, km.awayTeam], [r.homeTeam, r.awayTeam]));
}

// Points a user earns on one match.
//
// Group stage: 5 exact / 3 outcome on the predicted scoreline.
//
// Knockout (hybrid two-tier — see the koLive feature):
//   - A nailed matchup with a committed scoreline (cravado) always scores the full 5/3.
//   - A live re-pick (koLive[matchId]) recovers a GAP — a slot the user missed or left
//     without a KO scoreline — at the reduced 2/1 tier. It never overrides a cravado, so
//     scoring self-heals when the bracket allocation shifts a slot from gap→cravado: a
//     now-orphaned re-pick from the gap era can't rob the correct prediction of its 5/3.
export function matchPoints(matchId, preds, koMatches, results, koLive = null) {
  const r = results[matchId];
  if (!r || r.status !== 'finished' || r.home == null || r.away == null) return 0;

  if (GROUP_IDS.has(matchId)) {
    const p = preds[matchId];
    if (!p) return 0;
    return scorelinePoints(p.home, p.away, r.home, r.away);
  }

  const km = koMatches[matchId];
  if (!isCravado(km, r)) {
    // Not a cravado: a live re-pick (if any) scores the reduced 2/1 tier. The re-pick is
    // already in the real home/away orientation, so no align. No re-pick → no points.
    const live = koLive && koLive[matchId];
    if (live && live.home != null && live.away != null) {
      return scorelinePoints(live.home, live.away, r.home, r.away, 2, 1);
    }
    return 0;
  }

  // Align the predicted scoreline to the real home/away orientation.
  return km.homeTeam === r.homeTeam
    ? scorelinePoints(km.home, km.away, r.home, r.away)
    : scorelinePoints(km.home, km.away, r.away, r.home);
}

// Whether a slot is scored by a live re-pick (used for the points breakdown and
// to drive the UI's "this is a 2/1 pick" state). A re-pick only applies to KO slots.
export function isLivePick(matchId, koLive) {
  if (GROUP_IDS.has(matchId)) return false;
  const live = koLive && koLive[matchId];
  return !!(live && live.home != null && live.away != null);
}

// Whether the user's predicted matchup for a KO slot equals the real one (both
// teams, unordered). False until the real matchup is resolved. Drives the
// acertou/errou split that the guided fill screen is built on.
export function koMatchupHit(matchId, koMatches, results) {
  const km = koMatches[matchId], r = results[matchId];
  if (!km || km.homeTeam == null || km.awayTeam == null) return false;
  if (!r || r.homeTeam == null || r.awayTeam == null) return false;
  return sameTeams([km.homeTeam, km.awayTeam], [r.homeTeam, r.awayTeam]);
}

// Total points + breakdown for a user across all known results. `koLive` is the
// user's live re-picks ({ matchId: {home, away, penWinner?} }); omit it to score
// the predicted bracket only (back-compatible). `predicted`/`live` split the total
// so the UI can show "Previsão X · Ao vivo Y".
export function scoreUser(preds, results, koLive = null) {
  const koMatches = resolveKnockout(preds);
  const groupsDone = groupStageScorable(preds, results);
  let total = 0, exact = 0, correct = 0, predicted = 0, live = 0;
  Object.keys(results).forEach(id => {
    // Knockout points don't count until the group stage is fully predicted.
    if (!groupsDone && !GROUP_IDS.has(id)) return;
    const pts = matchPoints(id, preds, koMatches, results, koLive);
    total += pts;
    if (pts === 5) exact++;
    else if (pts === 3) correct++;
    // A re-pick only earns "live" points on a gap; a cravado's points are always predicted.
    const asLive = isLivePick(id, koLive) && !isCravado(koMatches[id], results[id]);
    if (asLive) live += pts; else predicted += pts;
  });
  return { total, exact, correct, predicted, live };
}

// -----------------------------------------------------------------------
// Achievements / badges (intrinsic to one user's preds + the real results)
// -----------------------------------------------------------------------
const kms = k => (typeof k?.toMillis === 'function' ? k.toMillis() : Number(k)) || 0;

function isFinished(r) {
  return r && r.status === 'finished' && r.home != null && r.away != null;
}

function winnerOf(home, away, homeTeam, awayTeam, penWinner) {
  const h = Number(home), a = Number(away);
  if (isNaN(h) || isNaN(a)) return null;
  if (h > a) return homeTeam;
  if (a > h) return awayTeam;
  return penWinner || null;
}

// The champion a user is predicting (null until they've filled the final).
export function predictedChampion(preds) {
  const f = resolveKnockout(preds)['FINAL'];
  if (!f || f.home == null || f.away == null) return null;
  return winnerOf(f.home, f.away, f.homeTeam, f.awayTeam, f.penWinner);
}

// The real champion (null until the final is finished).
export function actualChampion(results) {
  const f = results['FINAL'];
  if (!isFinished(f)) return null;
  return winnerOf(f.home, f.away, f.homeTeam, f.awayTeam, f.penWinner);
}

export function isNostradamus(preds, results) {
  const actual = actualChampion(results);
  return actual != null && predictedChampion(preds) === actual;
}

// Longest run of consecutive finished matches (in kickoff order) the user scored on.
export function bestStreak(preds, results) {
  const ko = resolveKnockout(preds);
  const finished = Object.keys(results)
    .filter(id => isFinished(results[id]))
    .sort((a, b) => kms(results[a].kickoff) - kms(results[b].kickoff) || a.localeCompare(b));
  let best = 0, cur = 0;
  finished.forEach(id => {
    if (matchPoints(id, preds, ko, results) >= 3) { cur++; best = Math.max(best, cur); }
    else cur = 0;
  });
  return best;
}

// How many groups the user got fully right (all 6 matches finished and scored ≥3).
export function perfectGroups(preds, results) {
  const ko = resolveKnockout(preds);
  let count = 0;
  Object.values(GROUPS).forEach(g => {
    const allFinished = g.matches.every(m => isFinished(results[m.id]));
    if (allFinished && g.matches.every(m => matchPoints(m.id, preds, ko, results) >= 3)) count++;
  });
  return count;
}
