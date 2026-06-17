import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

// The roster cache must stop ranking/compare from re-reading every user's
// predictions on each navigation and on every live score update — that re-read
// was burning the Firestore daily quota. `window.__reads` is exposed by the fake
// backend so we can assert the read budget directly.

const USERS = [user('me', 'Eu'), user('alice', 'Alice'), user('bob', 'Bob')];
const PREDS = {
  me: { A1: { home: 1, away: 0 } },        // incomplete → app lands on the groups tab
  alice: { A1: { home: 2, away: 0 } },
  bob: { A1: { home: 0, away: 0 } },
};

const reads = page => page.evaluate(() => window.__reads.userPreds);

test('navigating between tabs does not re-read predictions', async ({ page }) => {
  await boot(page, { currentUser: user('me', 'Eu'), users: USERS, predictions: PREDS, resetVersions: { me: 1 } });

  await page.locator('.nav-tab[data-view="ranking"]').click();
  await expect(page.locator('#view-ranking')).toBeVisible();
  const first = await reads(page);
  expect(first).toBe(USERS.length); // one read per user, once

  // Leave and come back to the ranking (shares the cache): no new reads.
  await page.locator('.nav-tab[data-view="groups"]').click();
  await page.locator('.nav-tab[data-view="ranking"]').click();
  await expect(page.locator('#view-ranking')).toBeVisible();
  expect(await reads(page)).toBe(first);

  // The explicit refresh button is the only thing that re-reads.
  await page.locator('#view-ranking .btn-refresh').click();
  await expect.poll(() => reads(page)).toBe(first * 2);
});

test('a live score update re-renders the ranking without re-reading', async ({ page }) => {
  // A1 starts imminent (not finished) so the live window is open and the listener
  // is attached — the ranking shows empty until a result is finished.
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: USERS,
    predictions: PREDS,
    results: { A1: { status: 'scheduled', homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() } },
    resetVersions: { me: 1 },
  });

  await page.locator('.nav-tab[data-view="ranking"]').click();
  await expect(page.locator('#view-ranking .ranking-empty')).toBeVisible(); // no finished results yet
  const before = await reads(page);

  // Ingester marks A1 finished → the live listener re-renders the ranking.
  await page.evaluate(() => localStorage.setItem('e2e_results', JSON.stringify({
    A1: { status: 'finished', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() },
  })));

  // The empty notice disappears (proves the re-render happened)…
  await expect(page.locator('#view-ranking .ranking-empty')).toHaveCount(0);
  // …and it cost zero extra prediction reads.
  expect(await reads(page)).toBe(before);
});

test('editing your own picks updates the ranking from cache (no read)', async ({ page }) => {
  await boot(page, { currentUser: user('me', 'Eu'), users: USERS, predictions: PREDS, resetVersions: { me: 1 } });

  await page.locator('.nav-tab[data-view="ranking"]').click();
  const before = await reads(page);

  await page.locator('.nav-tab[data-view="groups"]').click();
  await page.locator('.score-input[data-match-id="A2"][data-side="home"]').fill('3');
  await page.locator('.score-input[data-match-id="A2"][data-side="away"]').fill('1');
  await page.locator('.score-input[data-match-id="A2"][data-side="away"]').blur();

  await page.locator('.nav-tab[data-view="ranking"]').click();
  await expect(page.locator('#view-ranking')).toContainText('Eu');
  expect(await reads(page)).toBe(before); // own edit synced locally, no Firestore read
});
