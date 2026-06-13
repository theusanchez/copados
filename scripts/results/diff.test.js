import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultChanged, tsMs } from './diff.js';

const base = {
  status: 'scheduled', home: null, away: null,
  homeTeam: 'Brasil', awayTeam: 'Marrocos', kickoff: 1000, penWinner: null,
};

test('missing existing doc counts as changed', () => {
  assert.equal(resultChanged(undefined, base), true);
});

test('identical docs are unchanged', () => {
  assert.equal(resultChanged({ ...base }, { ...base }), false);
});

test('updatedAt-only difference is ignored', () => {
  assert.equal(resultChanged({ ...base, updatedAt: 1 }, { ...base, updatedAt: 999 }), false);
});

test('status change is detected (scheduled -> live)', () => {
  assert.equal(resultChanged({ ...base }, { ...base, status: 'live' }), true);
});

test('scoreline change is detected', () => {
  assert.equal(resultChanged({ ...base, home: 1, away: 0 }, { ...base, home: 2, away: 0 }), true);
});

test('penWinner change is detected', () => {
  const a = { ...base, status: 'finished', home: 1, away: 1 };
  assert.equal(resultChanged(a, { ...a, penWinner: 'Brasil' }), true);
});

test('kickoff compared by epoch across Timestamp shapes', () => {
  assert.equal(tsMs({ toMillis: () => 5000 }), 5000);
  assert.equal(tsMs({ seconds: 5, nanoseconds: 0 }), 5000);
  assert.equal(tsMs({ _seconds: 5 }), 5000);
  assert.equal(
    resultChanged({ ...base, kickoff: { toMillis: () => 1000 } }, { ...base, kickoff: 1000 }),
    false,
  );
  assert.equal(
    resultChanged({ ...base, kickoff: 1000 }, { ...base, kickoff: 2000 }),
    true,
  );
});

test('absent vs null fields treated equal', () => {
  const stored = { status: 'scheduled', home: null, away: null, homeTeam: 'Brasil', awayTeam: 'Marrocos', kickoff: 1000 };
  assert.equal(resultChanged(stored, base), false); // base adds penWinner: null
});
