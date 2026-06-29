import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS } from './data.js';
import { groupStageScorable, matchPoints, isLivePick, buildKnockoutMatches } from './engine.js';
import { THIRDS_TABLE, THIRDS_SLOT_ORDER } from './thirds-table.js';

const ALL_GROUP = Object.values(GROUPS).flatMap(g => g.matches);

function allPredicted() {
  const p = {};
  ALL_GROUP.forEach(m => { p[m.id] = { home: 1, away: 0 }; });
  return p;
}

test('all group games predicted → scorable', () => {
  assert.equal(groupStageScorable(allPredicted(), {}), true);
});

test('a single missing prediction blocks scoring', () => {
  const p = allPredicted();
  delete p[ALL_GROUP[0].id];
  assert.equal(groupStageScorable(p, {}), false);
});

test('a finished game counts as settled even without a prediction (late joiner)', () => {
  const p = allPredicted();
  const missing = ALL_GROUP[0].id;
  delete p[missing];
  assert.equal(
    groupStageScorable(p, { [missing]: { status: 'finished', home: 1, away: 0 } }),
    true,
  );
});

test('a not-yet-finished game does not settle a missing prediction', () => {
  const p = allPredicted();
  const missing = ALL_GROUP[0].id;
  delete p[missing];
  assert.equal(
    groupStageScorable(p, { [missing]: { status: 'live', home: 0, away: 0 } }),
    false,
  );
});

// --- knockout hybrid two-tier scoring (5/3 predicted vs 2/1 live re-pick) ---
const KO = 'R32_01';
const finished = (home, away, homeTeam = 'Brasil', awayTeam = 'Argentina') =>
  ({ [KO]: { status: 'finished', home, away, homeTeam, awayTeam } });
// A resolved predicted bracket entry for the slot.
const ko = (home, away, homeTeam = 'Brasil', awayTeam = 'Argentina') =>
  ({ [KO]: { home, away, homeTeam, awayTeam } });

test('KO matchup cravado + placar exato → 5', () => {
  assert.equal(matchPoints(KO, {}, ko(2, 0), finished(2, 0)), 5);
});

test('KO matchup cravado + só o vencedor → 3', () => {
  assert.equal(matchPoints(KO, {}, ko(3, 1), finished(2, 0)), 3);
});

test('KO matchup cravado + errou tudo → 0', () => {
  assert.equal(matchPoints(KO, {}, ko(0, 2), finished(2, 0)), 0);
});

test('KO matchup cravado mas times em ordem invertida ainda alinha → 5', () => {
  // predicted Argentina×Brasil 0×2, real Brasil×Argentina 2×0 → same result.
  const km = { [KO]: { home: 0, away: 2, homeTeam: 'Argentina', awayTeam: 'Brasil' } };
  assert.equal(matchPoints(KO, {}, km, finished(2, 0)), 5);
});

test('KO matchup errado e sem re-palpite → 0', () => {
  // predicted França×Brasil, real Brasil×Argentina → matchup mismatch.
  const km = { [KO]: { home: 2, away: 0, homeTeam: 'França', awayTeam: 'Brasil' } };
  assert.equal(matchPoints(KO, {}, km, finished(2, 0)), 0);
});

test('re-palpite ao vivo + placar exato → 2 (tier reduzido)', () => {
  const live = { [KO]: { home: 2, away: 0 } };
  assert.equal(matchPoints(KO, {}, {}, finished(2, 0), live), 2);
});

test('re-palpite ao vivo + só o vencedor → 1', () => {
  const live = { [KO]: { home: 3, away: 1 } };
  assert.equal(matchPoints(KO, {}, {}, finished(2, 0), live), 1);
});

test('re-palpite sobrepõe o cravado: trocar um 5 vira no máximo 2', () => {
  // predicted matchup matches AND scoreline is exact (would be 5), but the user
  // re-picked the same game → drops to the live tier on the live scoreline.
  const live = { [KO]: { home: 1, away: 0 } }; // outcome-only on a real 2×0 → 1
  assert.equal(matchPoints(KO, {}, ko(2, 0), finished(2, 0), live), 1);
});

test('isLivePick: true só com re-palpite completo num slot de KO', () => {
  assert.equal(isLivePick(KO, { [KO]: { home: 1, away: 0 } }), true);
  assert.equal(isLivePick(KO, { [KO]: { home: 1 } }), false);
  assert.equal(isLivePick(KO, {}), false);
  assert.equal(isLivePick('A1', { A1: { home: 1, away: 0 } }), false); // group id
});

// --- best-third allocation to R32 slots (official FIFA Annex C table) ---
const B3_SLOTS = ['R32_02','R32_05','R32_07','R32_08','R32_09','R32_10','R32_13','R32_15'];
const B3_ELIG = {
  R32_02:'ABCDF', R32_05:'CDFGH', R32_07:'CEFHI', R32_08:'EHIJK',
  R32_09:'BEFIJ', R32_10:'AEHIJ', R32_13:'EFGIJ', R32_15:'DEIJL',
};
// Craft an adv where each group's third is a recognisable token "T_<group>".
function advForThirds(qGroups) {
  const letters = 'ABCDEFGHIJKL'.split('');
  const winners = {}, runners = {};
  letters.forEach(g => { winners[g] = 'W_' + g; runners[g] = 'R_' + g; });
  const bestThirds = qGroups.split('').map(g => ({ group: g, team: 'T_' + g }));
  return { winners, runners, bestThirds, all: {}, thirds: bestThirds };
}
// away of each b3 slot, as a group letter
function b3GroupsOf(bracket) {
  const out = {};
  B3_SLOTS.forEach(id => { out[id] = (bracket[id].awayTeam || '').replace('T_', ''); });
  return out;
}

test('THIRDS_TABLE: 495 combinations, each a valid eligible perfect matching', () => {
  assert.equal(Object.keys(THIRDS_TABLE).length, 495);
  assert.deepEqual(THIRDS_SLOT_ORDER, B3_SLOTS);
  for (const [q, val] of Object.entries(THIRDS_TABLE)) {
    assert.equal(val.length, 8, `value length for ${q}`);
    assert.equal(new Set(val).size, 8, `distinct groups for ${q}`);
    THIRDS_SLOT_ORDER.forEach((slot, i) => {
      assert.ok(q.includes(val[i]), `${q}: ${val[i]} must be a qualifying group`);
      assert.ok(B3_ELIG[slot].includes(val[i]), `${q}: ${val[i]} not eligible for ${slot}`);
    });
  }
});

test('best-thirds routed by the official table — real 2026 case (Q=BDEFIJKL)', () => {
  const bracket = buildKnockoutMatches(advForThirds('BDEFIJKL'), {});
  assert.deepEqual(b3GroupsOf(bracket), {
    R32_02: 'D', R32_05: 'F', R32_07: 'E', R32_08: 'K',
    R32_09: 'B', R32_10: 'I', R32_13: 'J', R32_15: 'L',
  });
});

test('best-thirds routed by the official table — Q=EFGHIJKL (row 1)', () => {
  const bracket = buildKnockoutMatches(advForThirds('EFGHIJKL'), {});
  assert.deepEqual(b3GroupsOf(bracket), {
    R32_02: 'F', R32_05: 'G', R32_07: 'E', R32_08: 'K',
    R32_09: 'I', R32_10: 'H', R32_13: 'J', R32_15: 'L',
  });
});

test('incomplete bracket (<8 thirds) falls back to greedy without throwing', () => {
  const adv = advForThirds('BD'); // only 2 thirds resolved
  const bracket = buildKnockoutMatches(adv, {});
  assert.ok(bracket.R32_02 && 'awayTeam' in bracket.R32_02);
});
