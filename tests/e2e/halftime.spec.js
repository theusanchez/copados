import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

test('a paused match shows the INTERVALO badge and stays locked', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'paused', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() },
    },
  });

  const card = page.locator('#match-A1');
  await expect(card).toHaveClass(/\bpaused\b/);
  await expect(card.locator('.match-live')).toContainText('INTERVALO');
  await expect(card.locator('.match-live')).not.toContainText('AO VIVO');
  await expect(card.locator('.live-score')).toContainText('1 × 0');
  await expect(page.locator('.score-input[data-match-id="A1"][data-side="home"]'))
    .toHaveAttribute('readonly', '');
});

test('halftime also shows in the fixtures view', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'paused', home: 2, away: 1, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() },
    },
  });
  await page.locator('.nav-tab[data-view="fixtures"]').click();

  const card = page.locator('#fx-match-A1');
  await expect(card).toHaveClass(/\bpaused\b/);
  await expect(card.locator('.live-label')).toHaveText('INTERVALO');
  await expect(card.locator('.live-score')).toContainText('2 × 1');
});

test('a live (not paused) match still shows AO VIVO', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'live', home: 0, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() },
    },
  });

  const card = page.locator('#match-A1');
  await expect(card).toHaveClass(/\blive\b/);
  await expect(card).not.toHaveClass(/\bpaused\b/);
  await expect(card.locator('.live-label')).toHaveText('AO VIVO');
});
