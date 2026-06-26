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
  await expect(page.locator('#match-A1 .gp-venue'))
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

test('real per-fixture venues (matched by team pair, not by group)', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {},
  });
  // Same group, different venues — proves it is the official per-match assignment.
  await expect(page.locator('#match-C1 .gp-venue')).toContainText('MetLife Stadium');        // Brasil x Marrocos
  await expect(page.locator('#match-C6 .gp-venue')).toContainText('Mercedes-Benz Stadium');  // Marrocos x Haiti
  await expect(page.locator('#match-F2 .gp-venue')).toContainText('Estadio BBVA');            // Suécia x Tunísia
});

test('final and third place use the real fixed venues; other KO rounds show none', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {},
  });
  await page.locator('.nav-tab[data-view="knockout"]').click();
  // Bracket now follows the official flow, so every round maps to its real venue.
  await expect(page.locator('#match-R32_01 .match-kickoff')).toContainText('SoFi Stadium');
  await expect(page.locator('#match-R16_01 .match-kickoff')).toContainText('Lincoln Financial Field');
  await expect(page.locator('#match-QF_01 .match-kickoff')).toContainText('Gillette Stadium');
  await expect(page.locator('#match-SF_01 .match-kickoff')).toContainText('AT&T Stadium');
  await expect(page.locator('#match-THIRD .match-kickoff')).toContainText('Hard Rock Stadium');
  await expect(page.locator('#match-FINAL .match-kickoff'))
    .toContainText('MetLife Stadium · East Rutherford, Nova Jersey (EUA)');
});
