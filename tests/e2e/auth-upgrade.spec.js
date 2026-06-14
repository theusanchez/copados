import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

test('a guest upgrades to a real account keeping their predictions', async ({ page }) => {
  await boot(page, { currentUser: null, users: [] });

  await page.locator('#btn-guest').click();
  await expect(page.locator('#user-info')).toContainText('Convidado');

  // Guest fills a prediction.
  await page.locator('.score-input[data-match-id="A1"][data-side="home"]').fill('3');
  await page.locator('.score-input[data-match-id="A1"][data-side="away"]').fill('1');
  await page.locator('.score-input[data-match-id="A1"][data-side="away"]').blur();

  // From the ranking gate, create a real account.
  await page.locator('.nav-tab[data-view="ranking"]').click();
  const gate = page.locator('#view-ranking .guest-gate');
  await expect(gate).toBeVisible();
  await gate.locator('input[type="text"]').fill('Diego');
  await gate.locator('input[type="email"]').fill('diego@example.com');
  await gate.locator('input[type="password"]').fill('senha123');
  await gate.locator('.btn-upgrade').click();

  // Gate is gone, account is real.
  await expect(page.locator('#view-ranking .guest-gate')).toHaveCount(0);
  await expect(page.locator('#user-info')).toContainText('Diego');
  await expect(page.locator('.nav-tab[data-view="ranking"]')).not.toHaveClass(/locked/);

  // Predictions carried over (same uid).
  await page.locator('.nav-tab[data-view="groups"]').click();
  await expect(page.locator('.score-input[data-match-id="A1"][data-side="home"]')).toHaveValue('3');

  // And the upgraded user now appears in compare.
  await page.locator('.nav-tab[data-view="compare"]').click();
  await expect(page.locator('#view-compare')).toContainText('Diego');
});
