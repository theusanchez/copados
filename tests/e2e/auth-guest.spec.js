import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

test('a guest can play but is gated out of ranking and compare', async ({ page }) => {
  await boot(page, { currentUser: null, users: [] });

  await page.locator('#btn-guest').click();

  await expect(page.locator('#view-app')).toBeVisible();
  await expect(page.locator('#user-info')).toContainText('Convidado');

  // Guests can still fill predictions.
  await page.locator('.score-input[data-match-id="A1"][data-side="home"]').fill('2');
  await page.locator('.score-input[data-match-id="A1"][data-side="away"]').fill('1');
  await page.locator('.score-input[data-match-id="A1"][data-side="away"]').blur();

  // Ranking is locked behind a sign-up gate.
  await page.locator('.nav-tab[data-view="ranking"]').click();
  await expect(page.locator('#view-ranking .guest-gate')).toBeVisible();
  await expect(page.locator('#view-ranking .ranking-row')).toHaveCount(0);
  await expect(page.locator('.nav-tab[data-view="ranking"]')).toHaveClass(/locked/);

  // Compare too.
  await page.locator('.nav-tab[data-view="compare"]').click();
  await expect(page.locator('#view-compare .guest-gate')).toBeVisible();
  await expect(page.locator('#view-compare .compare-card')).toHaveCount(0);
});

test('guests never show up in another user\'s compare list', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [
      user('me', 'Eu'),
      { uid: 'g1', displayName: 'Convidado', email: null, photoURL: null, isAnonymous: true },
    ],
  });

  await page.locator('.nav-tab[data-view="compare"]').click();
  await expect(page.locator('#view-compare')).toContainText('Eu');
  await expect(page.locator('#view-compare')).not.toContainText('Convidado');
});
