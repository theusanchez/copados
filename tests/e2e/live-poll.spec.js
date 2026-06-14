import { test, expect } from '@playwright/test';
import { seed, user, enableLive } from './helpers.js';

const T = new Date('2026-06-13T19:00:00Z').getTime();
const HOUR = 3600000;

test('a match going live shows the badge without a manual reload', async ({ page }) => {
  await page.clock.install({ time: T });
  await enableLive(page);
  await seed(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu')],
    predictions: {},
    results: {
      A1: { status: 'scheduled', homeTeam: 'México', awayTeam: 'África do Sul', kickoff: T + HOUR },
    },
  });
  await page.goto('/index.html?e2e=1');
  await page.locator('.nav-tab[data-view="fixtures"]').click();

  // Not live yet.
  await expect(page.locator('#fx-match-A1 .match-live')).toHaveCount(0);

  // The ingester marks it live (simulated via the fake backend override).
  await page.evaluate(() => localStorage.setItem('e2e_results', JSON.stringify({
    A1: { status: 'live', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() },
  })));

  // One poll cycle later, the live badge appears — no reload.
  await page.clock.fastForward(61000);
  await expect(page.locator('#fx-match-A1')).toHaveClass(/\blive\b/);
  await expect(page.locator('#fx-match-A1 .live-score')).toContainText('1 × 0');
});
