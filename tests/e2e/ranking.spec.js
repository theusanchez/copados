import { test, expect } from '@playwright/test';
import { boot, user } from './helpers.js';

// Group A round 1 = A1, A2 · round 2 = A3, A4.
const RESULTS_R1 = {
  A1: { status: 'finished', home: 1, away: 0, homeTeam: 'México', awayTeam: 'África do Sul', kickoff: 1 },
  A2: { status: 'finished', home: 2, away: 2, homeTeam: 'Coreia do Sul', awayTeam: 'República Tcheca', kickoff: 2 },
};
const RESULTS_R2 = {
  A3: { status: 'finished', home: 0, away: 1, homeTeam: 'República Tcheca', awayTeam: 'África do Sul', kickoff: 3 },
  A4: { status: 'finished', home: 3, away: 1, homeTeam: 'México', awayTeam: 'Coreia do Sul', kickoff: 4 },
};

const PREDS = {
  me:    { A1: { home: 1, away: 0 }, A2: { home: 0, away: 0 }, A3: { home: 0, away: 1 }, A4: { home: 3, away: 1 } }, // 5+3+5+5 = 18
  alice: { A1: { home: 2, away: 0 }, A2: { home: 1, away: 1 }, A3: { home: 0, away: 2 }, A4: { home: 2, away: 0 } }, // 3+3+3+3 = 12
  bob:   { A1: { home: 1, away: 0 }, A2: { home: 3, away: 3 }, A3: { home: 2, away: 0 }, A4: { home: 0, away: 2 } }, // 5+3+0+0 = 8
};

const USERS = [user('me', 'Eu'), user('alice', 'Alice'), user('bob', 'Bob')];

function rows(page) {
  return page.locator('#view-ranking .ranking-row');
}

test('single played round shows round points and no movement (estreia)', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: USERS,
    predictions: PREDS,
    results: { ...RESULTS_R1 },
  });
  await page.locator('.nav-tab[data-view="ranking"]').click();

  await expect(page.locator('.ranking-round-note')).toContainText('Rodada 1 (grupos)');
  // After R1: Bob 8, Eu 8 (tiebreak by name → Bob first), Alice 6.
  await expect(rows(page).nth(0)).toContainText('Bob');
  await expect(rows(page).nth(0).locator('.rank-move-flat')).toBeVisible();
  await expect(rows(page).nth(0).locator('.ranking-round-pts')).toHaveText('+8');
});

test('second round recomputes points and position movement', async ({ page }) => {
  await boot(page, {
    currentUser: user('me', 'Eu'),
    users: USERS,
    predictions: PREDS,
    results: { ...RESULTS_R1, ...RESULTS_R2 },
  });
  await page.locator('.nav-tab[data-view="ranking"]').click();

  await expect(page.locator('.ranking-round-note')).toContainText('Rodada 2 (grupos)');

  // Final order: Eu 18, Alice 12, Bob 8.
  const r0 = rows(page).nth(0), r1 = rows(page).nth(1), r2 = rows(page).nth(2);

  await expect(r0).toContainText('Eu');
  await expect(r0.locator('.ranking-total')).toContainText('18');
  await expect(r0.locator('.rank-move-up')).toHaveText('▲1'); // was 2nd after R1
  await expect(r0.locator('.ranking-round-pts')).toHaveText('+10');

  await expect(r1).toContainText('Alice');
  await expect(r1.locator('.rank-move-up')).toHaveText('▲1'); // was 3rd
  await expect(r1.locator('.ranking-round-pts')).toHaveText('+6');

  await expect(r2).toContainText('Bob');
  await expect(r2.locator('.rank-move-down')).toHaveText('▼2'); // was 1st
  await expect(r2.locator('.ranking-round-pts')).toHaveCount(0); // scored 0 this round
});
