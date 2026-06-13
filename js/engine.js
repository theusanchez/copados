import { GROUPS, KNOCKOUT } from './data.js';

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

  function resolveSlotTracked(slot) {
    if (slot.type === 'b3') {
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
      const homeTeam = resolveSlotTracked(match.home);
      const awayTeam = resolveSlotTracked(match.away);
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

// The knockout bracket only makes sense once every group match has been predicted —
// before that the bracket is resolved from partial standings and shouldn't count.
export function groupsComplete(preds) {
  return Object.values(GROUPS).flatMap(g => g.matches).every(m => {
    const p = preds[m.id];
    return p && p.home != null && p.away != null;
  });
}

function scorelinePoints(ph, pa, rh, ra) {
  if (ph == null || pa == null || rh == null || ra == null) return 0;
  ph = Number(ph); pa = Number(pa); rh = Number(rh); ra = Number(ra);
  if (ph === rh && pa === ra) return 5;
  return Math.sign(ph - pa) === Math.sign(rh - ra) ? 3 : 0;
}

function sameTeams(a, b) {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

// Points a user earns on one match. Knockout only scores if the predicted
// matchup (both teams) equals the actual matchup.
export function matchPoints(matchId, preds, koMatches, results) {
  const r = results[matchId];
  if (!r || r.status !== 'finished' || r.home == null || r.away == null) return 0;

  if (GROUP_IDS.has(matchId)) {
    const p = preds[matchId];
    if (!p) return 0;
    return scorelinePoints(p.home, p.away, r.home, r.away);
  }

  const km = koMatches[matchId];
  if (!km || km.home == null || km.away == null) return 0;
  if (!sameTeams([km.homeTeam, km.awayTeam], [r.homeTeam, r.awayTeam])) return 0;
  // Align the predicted scoreline to the real home/away orientation.
  return km.homeTeam === r.homeTeam
    ? scorelinePoints(km.home, km.away, r.home, r.away)
    : scorelinePoints(km.home, km.away, r.away, r.home);
}

// Total points + breakdown for a user across all known results.
export function scoreUser(preds, results) {
  const koMatches = resolveKnockout(preds);
  const groupsDone = groupsComplete(preds);
  let total = 0, exact = 0, correct = 0;
  Object.keys(results).forEach(id => {
    // Knockout points don't count until the group stage is fully predicted.
    if (!groupsDone && !GROUP_IDS.has(id)) return;
    const pts = matchPoints(id, preds, koMatches, results);
    total += pts;
    if (pts === 5) exact++;
    else if (pts === 3) correct++;
  });
  return { total, exact, correct };
}
