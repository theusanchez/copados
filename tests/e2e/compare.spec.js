import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

test('comparison shows the official result and each user\'s points', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu'), user('alice', 'Alice')],
    predictions: {
      me: { A1: { home: 2, away: 0 } },     // cravou
      alice: { A1: { home: 1, away: 0 } },  // acertou o resultado
    },
    results: {
      A1: { status: 'finished', home: 2, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: 1 },
    },
  });

  await page.locator('.nav-tab[data-view="compare"]').click();
  await page.locator('.compare-card', { hasText: 'Alice' }).click();

  const a1 = page.locator('#compare-detail .cmp-match', { hasText: 'México' }).first();
  // Official result row.
  await expect(a1.locator('.cmp-row-official')).toContainText('Resultado');
  await expect(a1.locator('.cmp-row-official')).toContainText('2 — 0');
  // Points: me cravou (+5), Alice acertou o resultado (+3).
  await expect(a1.locator('.cmp-pts-exact')).toHaveText('+5');
  await expect(a1.locator('.cmp-pts-partial')).toHaveText('+3');
});

test('no official result row before a match is finished', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: [user('me', 'Eu'), user('alice', 'Alice')],
    predictions: { me: { A1: { home: 2, away: 0 } }, alice: { A1: { home: 1, away: 0 } } },
    results: {
      A1: { status: 'scheduled', homeTeam: 'México', awayTeam: 'África do Sul', kickoff: Date.now() + 3600000 },
    },
  });

  await page.locator('.nav-tab[data-view="compare"]').click();
  await page.locator('.compare-card', { hasText: 'Alice' }).click();

  const a1 = page.locator('#compare-detail .cmp-match', { hasText: 'México' }).first();
  await expect(a1.locator('.cmp-row-official')).toHaveCount(0);
  await expect(a1.locator('.cmp-pts')).toHaveCount(0);
});
