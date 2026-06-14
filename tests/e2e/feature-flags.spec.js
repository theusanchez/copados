import { test, expect } from '@playwright/test';
import { boot, user, enableLive, disableLive } from './helpers.js';

const liveA1 = {
  currentUser: user('me', 'Eu'),
  users: [user('me', 'Eu')],
  predictions: {},
  results: {
    A1: { status: 'live', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() },
  },
};

test('live badge shows by default (liveScores flag on)', async ({ page }) => {
  await boot(page, liveA1);
  await expect(page.locator('#match-A1 .match-live')).toContainText('AO VIVO');
});

test('live badge is hidden when the flag is forced off', async ({ page }) => {
  await disableLive(page);
  await boot(page, liveA1);
  // No AO VIVO badge and no live class.
  await expect(page.locator('#match-A1')).not.toHaveClass(/\blive\b/);
  await expect(page.locator('#match-A1 .match-live')).toHaveCount(0);
  // The match is still locked (kickoff passed) — you can't predict it mid-game.
  await expect(page.locator('.score-input[data-match-id="A1"][data-side="home"]'))
    .toHaveAttribute('readonly', '');
});
