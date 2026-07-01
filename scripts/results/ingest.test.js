import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, KNOCKOUT, CODES } from '../../js/data.js';
import { computeAdvancing, buildKnockoutMatches } from '../../js/engine.js';
import { buildResultDocs } from './ingest.js';

// Build API team objects the ingester can resolve. The PT name won't match the English
// NAME_TO_PT keys, so toPt falls back to the tla (CODES = PT -> tla), which is enough.
const apiTeam = pt => ({ name: pt, tla: CODES[pt] });

// Finished group fixtures with a strict, deterministic order: the lower-indexed team in
// GROUPS[g].teams always wins. So per group: 1st=teams[0], 2nd=teams[1], 3rd=teams[2].
function groupApiMatches() {
  const out = [];
  let id = 1000;
  for (const [letter, g] of Object.entries(GROUPS)) {
    const rank = t => g.teams.indexOf(t);
    for (const m of g.matches) {
      const homeStronger = rank(m.home) < rank(m.away);
      out.push({
        id: id++, stage: 'GROUP_STAGE', group: `GROUP_${letter}`, status: 'FINISHED',
        homeTeam: apiTeam(m.home), awayTeam: apiTeam(m.away),
        score: { fullTime: { home: homeStronger ? 2 : 0, away: homeStronger ? 0 : 2 } },
        utcDate: '2026-06-20T18:00:00Z',
      });
    }
  }
  return out;
}

// The advancing info the ingester will derive from those finished group results.
function advFromGroups() {
  const preds = {};
  for (const g of Object.values(GROUPS)) {
    for (const m of g.matches) {
      const homeStronger = g.teams.indexOf(m.home) < g.teams.indexOf(m.away);
      preds[m.id] = { home: homeStronger ? 2 : 0, away: homeStronger ? 0 : 2 };
    }
  }
  return computeAdvancing(preds);
}

let koId = 5000;
function koApiFixture(homePt, awayPt) {
  return {
    id: koId++, stage: 'LAST_32', status: 'FINISHED',
    homeTeam: apiTeam(homePt), awayTeam: apiTeam(awayPt),
    score: { fullTime: { home: 2, away: 1 }, winner: 'HOME_TEAM' },
    utcDate: '2026-06-29T18:00:00Z',
  };
}

// The three best-third R32 slots from the bug report and their eligible group sets.
const B3_SLOTS = {
  R32_02: ['A', 'B', 'C', 'D', 'F'], // home = winner E
  R32_05: ['C', 'D', 'F', 'G', 'H'], // home = winner I
  R32_07: ['C', 'E', 'F', 'H', 'I'], // home = winner A
};

test('b3 slots are placed even when the real third differs from the Annex-C prediction', () => {
  const adv = advFromGroups();
  const predicted = buildKnockoutMatches(adv, {});

  const koFixtures = [];
  const expected = {};
  for (const [slotId, groups] of Object.entries(B3_SLOTS)) {
    const slot = KNOCKOUT.r32.find(s => s.id === slotId);
    const winnerGroup = (slot.home.type === 'w' ? slot.home : slot.away).group;
    const winner = adv.winners[winnerGroup];
    const predictedThird = predicted[slotId].homeTeam === winner
      ? predicted[slotId].awayTeam : predicted[slotId].homeTeam;
    // Pick a DIFFERENT eligible third than the table predicted, so exact-pair matching
    // (the old behavior) would fail to place this fixture.
    const realThird = groups
      .map(gr => adv.all[gr]?.[2]?.team)
      .find(t => t && t !== predictedThird);
    assert.ok(realThird, `${slotId}: need an alternate eligible third`);
    assert.notEqual(realThird, predictedThird, `${slotId}: real third must differ from prediction`);
    koFixtures.push(koApiFixture(winner, realThird));
    expected[slotId] = { winner, realThird };
  }

  const { docs } = buildResultDocs([...groupApiMatches(), ...koFixtures]);

  for (const [slotId, { winner, realThird }] of Object.entries(expected)) {
    const d = docs[slotId];
    assert.ok(d, `${slotId} should be mapped`);
    assert.equal(d.status, 'finished', `${slotId} should be finished`);
    assert.equal(d.homeTeam, winner, `${slotId} home should be the group winner`);
    assert.equal(d.awayTeam, realThird, `${slotId} away should be the real third from the API`);
  }
});

test('non-b3 slots still match by exact team pair', () => {
  const adv = advFromGroups();
  // R32_06 = runner-up E x runner-up I (no third involved).
  const ruE = adv.runners.E, ruI = adv.runners.I;
  const { docs } = buildResultDocs([...groupApiMatches(), koApiFixture(ruE, ruI)]);
  assert.ok(docs.R32_06, 'R32_06 should be mapped');
  assert.equal(docs.R32_06.status, 'finished');
  assert.equal(docs.R32_06.homeTeam, ruE);
  assert.equal(docs.R32_06.awayTeam, ruI);
});
