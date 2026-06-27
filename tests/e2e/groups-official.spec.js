import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

// Group A: A1 México×África, A2 Coreia×Tcheca, A3 Tcheca×África, A4 México×Coreia.
const SEED = {
  currentUser: user('me', 'Eu'),
  users: [user('me', 'Eu')],
  // Picks that differ from the real results, so the two tables can't be confused.
  predictions: { me: { A1: { home: 0, away: 3 }, A2: { home: 0, away: 0 } } },
  results: {
    A1: { status: 'finished', home: 2, away: 0 },
    A2: { status: 'finished', home: 2, away: 1 },
    A3: { status: 'finished', home: 1, away: 1 },
    A4: { status: 'finished', home: 1, away: 0 },
    A5: { status: 'scheduled' },
    A6: { status: 'scheduled' },
  },
};

async function openGroups(page) {
  await page.locator('.nav-tab[data-view="groups"]').click();
  await expect(page.locator('#view-groups')).toBeVisible();
}

test('the Official toggle recomputes the standings from real results', async ({ page }) => {
  await boot(page, SEED);
  await openGroups(page);

  // Default view is "my picks": the toggle exists and picks is active.
  await expect(page.locator('.gp-view-btn[data-official="0"]')).toHaveClass(/\bactive\b/);

  await page.locator('.gp-view-btn[data-official="1"]').click();
  await expect(page.locator('.gp-view-btn[data-official="1"]')).toHaveClass(/\bactive\b/);

  // México won both of its games (2×0, 1×0) → 6 pts, top of the real table.
  const top = page.locator('#standings-A .standings-table tbody tr').first();
  await expect(top).toContainText('México');
  await expect(top.locator('.pts-cell')).toHaveText('6');

  // The official scoreline shows on the card; the editable stepper is gone.
  await expect(page.locator('#match-A1')).toContainText('2');
  await expect(page.locator('#match-A1 .score-input')).toHaveCount(0);
});

test('the toggle survives a group switch and flips back to picks', async ({ page }) => {
  await boot(page, SEED);
  await openGroups(page);

  await page.locator('.gp-view-btn[data-official="1"]').click();
  await page.locator('.group-tab[data-group="C"]').click();
  // Still official after switching tabs.
  await expect(page.locator('.gp-view-btn[data-official="1"]')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#group-panel-C')).toBeVisible();

  // Back to picks restores the editable steppers.
  await page.locator('.group-tab[data-group="A"]').click();
  await page.locator('.gp-view-btn[data-official="0"]').click();
  await expect(page.locator('#group-panel-A .gp-step-btn').first()).toBeVisible();
});
