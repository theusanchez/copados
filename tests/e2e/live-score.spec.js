import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

test('shows a live badge and current score on a group match in progress', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'live', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() },
    },
  });

  const card = page.locator('#match-A1');
  await expect(card).toHaveClass(/\blive\b/);
  await expect(card.locator('.match-live')).toContainText('AO VIVO');
  await expect(card.locator('.live-score')).toContainText('1 × 0');
});

test('live match inputs are locked', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'live', home: 2, away: 2, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() },
    },
  });

  await expect(page.locator('.score-input[data-match-id="A1"][data-side="home"]'))
    .toHaveAttribute('readonly', '');
});

test('a scheduled match shows kickoff time, not a live badge', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'scheduled', homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() + 86400000 },
    },
  });

  await expect(page.locator('#match-A1 .match-live')).toHaveCount(0);
  await expect(page.locator('#match-A1 .match-kickoff')).toBeVisible();
});
