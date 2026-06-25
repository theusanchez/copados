import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

const seedFinished = {
  currentUser: user('me', 'Eu'),
  users: [user('me', 'Eu'), user('alice', 'Alice')],
  predictions: {
    me: { A1: { home: 2, away: 0 } },     // cravou
    alice: { A1: { home: 1, away: 0 } },  // acertou o resultado
  },
  results: {
    A1: { status: 'finished', home: 2, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: 1 },
  },
};

test('ranking card opens the comparison modal with result and points', async ({ page }) => {
  await boot(page, seedFinished);

  await page.locator('.nav-tab[data-view="ranking"]').click();
  await page.locator('.rank-clickable[data-uid="alice"]').click();

  const modal = page.locator('#cmp-modal');
  await expect(modal).toBeVisible();
  // Aggregate scoreboard: me 5, Alice 3.
  const sb = modal.locator('.cmp-scoreboard');
  await expect(sb.locator('.cmp-sb-side').first()).toContainText('5');
  await expect(sb.locator('.cmp-sb-side').last()).toContainText('3');
  const a1 = modal.locator('.cmp-match', { hasText: 'MEX' }).first();
  // Official result in the fixture header.
  await expect(a1.locator('.cmp-fx-result')).toContainText('Resultado');
  await expect(a1.locator('.cmp-fx-result')).toContainText('2 — 0');
  // Points: me cravou (+5), Alice acertou o resultado (+3).
  await expect(a1.locator('.cmp-pts-exact')).toHaveText('+5');
  await expect(a1.locator('.cmp-pts-partial')).toHaveText('+3');
});

test('comparison modal closes via the backdrop', async ({ page }) => {
  await boot(page, seedFinished);

  await page.locator('.nav-tab[data-view="ranking"]').click();
  await page.locator('.rank-clickable[data-uid="alice"]').click();
  await expect(page.locator('#cmp-modal')).toBeVisible();

  await page.locator('#cmp-modal .cmp-modal-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#cmp-modal')).toBeHidden();
});

test('clicking your own ranking card does nothing', async ({ page }) => {
  await boot(page, seedFinished);

  await page.locator('.nav-tab[data-view="ranking"]').click();
  // Your own card is not marked clickable.
  await expect(page.locator('.rank-clickable[data-uid="me"]')).toHaveCount(0);
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

  await page.locator('.nav-tab[data-view="ranking"]').click();
  await page.locator('.rank-clickable[data-uid="alice"]').click();

  const modal = page.locator('#cmp-modal');
  await expect(modal).toBeVisible();
  const a1 = modal.locator('.cmp-match', { hasText: 'MEX' }).first();
  await expect(a1.locator('.cmp-fx-result')).toHaveCount(0);
  await expect(a1.locator('.cmp-fx-x')).toHaveCount(1);
  await expect(a1.locator('.cmp-pts')).toHaveCount(0);
});
