import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

test('group match shows its assigned stadium, city, state and country', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {},
  });

  // A1 → Group A → Estadio Azteca (Cidade do México).
  await expect(page.locator('#match-A1 .match-kickoff'))
    .toContainText('Estadio Azteca · Cidade do México, CDMX (México)');

  await page.locator('.nav-tab[data-view="fixtures"]').click();
  // Fixtures only lists matches with a kickoff, so seed one.
});

test('venue shows in the fixtures view', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'scheduled', homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() + 3600000 },
    },
  });
  await page.locator('.nav-tab[data-view="fixtures"]').click();
  await expect(page.locator('#fx-match-A1 .fx-venue')).toContainText('Estadio Azteca');
});

test('the final uses the real MetLife Stadium venue', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {},
  });
  await page.locator('.nav-tab[data-view="knockout"]').click();
  await expect(page.locator('#match-FINAL .match-kickoff'))
    .toContainText('MetLife Stadium · East Rutherford, Nova Jersey (EUA)');
});
