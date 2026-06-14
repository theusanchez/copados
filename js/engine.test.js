import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS } from './data.js';
import { groupStageScorable } from './engine.js';

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
