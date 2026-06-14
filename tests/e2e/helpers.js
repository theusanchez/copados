import { GROUPS, KNOCKOUT } from '../../js/data.js';

export const ALL_GROUP_MATCHES = Object.values(GROUPS).flatMap(g => g.matches);
export const ALL_KO_MATCHES = Object.values(KNOCKOUT).flat();

export function user(uid, displayName, extra = {}) {
  return { uid, displayName, email: `${uid}@example.com`, photoURL: null, ...extra };
}

// Fill every group match with a deterministic scoreline so the bracket resolves
// and the predictions count as "complete" for both group and knockout stages.
export function completeGroupPreds() {
  const preds = {};
  ALL_GROUP_MATCHES.forEach((m, i) => {
    preds[m.id] = { home: (i % 3) === 0 ? 2 : 1, away: (i % 3) === 0 ? 0 : (i % 2) };
  });
  return preds;
}

export function completeKnockoutPreds() {
  const preds = {};
  ALL_KO_MATCHES.forEach((m, i) => {
    preds[m.id] = { home: 2, away: i % 2 };
  });
  return preds;
}

export function fullPreds() {
  return { ...completeGroupPreds(), ...completeKnockoutPreds() };
}

// Install a seed into localStorage before the app boots.
export async function seed(page, data) {
  await page.addInitScript(d => {
    localStorage.setItem('e2e_seed', JSON.stringify(d));
  }, data);
}

export async function boot(page, data) {
  await seed(page, data);
  await page.goto('/index.html?e2e=1');
}

// Force the live-scores feature flag on/off for tests (overrides the default).
export async function enableLive(page) {
  await page.addInitScript(() => localStorage.setItem('feature_liveScores', 'true'));
}
export async function disableLive(page) {
  await page.addInitScript(() => localStorage.setItem('feature_liveScores', 'false'));
}
