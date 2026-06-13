import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

test('venue is shown on cards when the API provides it', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'scheduled', homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() + 3600000, venue: 'Estadio Azteca' },
    },
  });

  await expect(page.locator('#match-A1 .match-kickoff')).toContainText('Estadio Azteca');

  await page.locator('.nav-tab[data-view="fixtures"]').click();
  await expect(page.locator('#fx-match-A1 .fx-venue')).toContainText('Estadio Azteca');
});

test('no venue line when the field is absent', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'scheduled', homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() + 3600000 },
    },
  });

  await expect(page.locator('#match-A1 .match-kickoff')).not.toContainText('🏟️');
  await page.locator('.nav-tab[data-view="fixtures"]').click();
  await expect(page.locator('#fx-match-A1 .fx-venue')).toHaveCount(0);
});
