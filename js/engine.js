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
