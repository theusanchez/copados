import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS } from './data.js';
import { groupStageScorable, matchPoints, isLivePick } from './engine.js';

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
